import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/scheduler/cron-auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cap per-tick work so one oversized repo can't blow the cron timeout.
const MAX_WORKSPACES_PER_TICK = 10;
// Per-workspace wall-clock budget — one slow GitHub API call (or its retry
// window) must not hold the whole tick hostage.
const PER_WORKSPACE_TIMEOUT_MS = 20_000;
// Bound how many PRs a single tick pulls into memory so a mega-repo with
// thousands of PRs can't OOM/timeout the cron. We walk all states newest-
// activity first, so recently closed/merged PRs land within this budget.
const MAX_PRS_PER_TICK = 1_000;

type Workspace = {
  id: string;
  repo_owner: string;
  repo_name: string;
};

// Reject (without unwinding the underlying work) once `ms` elapses so one
// stuck GitHub call can't pin the request.
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * GitHub → store reconcile cron for pull requests. Sibling of `issue-sync`.
 * The webhook receiver upserts on `pull_request` events in real time; this
 * cron is the backfill + missed-delivery safety net.
 *
 * Pulls PRs (all states, newest-activity first) via Octokit and upserts them
 * into the `pull_requests` table — so PRs closed/merged upstream stop showing
 * as open. Per-workspace gated by the same `auto_triage_enabled` flag — repos opted
 * out of automated work still get a /prs page, so we sync regardless of that
 * flag and require only that a workspace exists.
 */
export async function GET(req: Request) {
  const unauthorized = requireCronSecret(req);
  if (unauthorized) return unauthorized;

  const supabase = createSupabaseAdminClient();

  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select('id, repo_owner, repo_name')
    .limit(MAX_WORKSPACES_PER_TICK);

  if (error) {
    console.error('[prs-sync] workspace query failed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!workspaces || workspaces.length === 0) {
    return NextResponse.json({ processed: 0 });
  }

  const core = await import('@cezar/core');
  const results = await Promise.all(
    (workspaces as Workspace[]).map(async (ws) => {
      try {
        return await withTimeout(
          syncOne(ws, supabase, core),
          PER_WORKSPACE_TIMEOUT_MS,
          'prs sync',
        );
      } catch (err) {
        // Log the full error server-side; never echo raw GitHub/Octokit error
        // text to the caller (it can carry tokens or other internals).
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[prs-sync] workspace ${ws.id} failed:`, msg);
        return { workspaceId: ws.id, ok: false, error: 'sync_failed' };
      }
    }),
  );

  return NextResponse.json({ processed: workspaces.length, results });
}

async function syncOne(
  ws: Workspace,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  core: typeof import('@cezar/core'),
): Promise<{ workspaceId: string; ok: true; prs: number }> {
  const token = await resolveWorkspaceToken(ws.id, supabase);
  if (!token) throw new Error('no github token available for workspace');

  const github = new core.GitHubService({
    github: { owner: ws.repo_owner, repo: ws.repo_name, token },
  } as never);

  const prs = await github.listPullRequests(MAX_PRS_PER_TICK);

  if (prs.length > 0) {
    const rows = prs.map((p) => ({
      workspace_id: ws.id,
      number: p.number,
      title: p.title,
      body: p.body,
      state: p.state,
      draft: p.draft,
      labels: p.labels,
      author: p.author,
      html_url: p.htmlUrl,
      head_sha: p.headSha,
      head_ref: p.headRef,
      base_ref: p.baseRef,
      pr_created_at: p.createdAt,
      pr_updated_at: p.updatedAt,
    }));
    const { error: upsertErr } = await supabase
      .from('pull_requests')
      .upsert(rows, { onConflict: 'workspace_id,number' });
    if (upsertErr) throw new Error(`pull_requests upsert failed: ${upsertErr.message}`);
  }

  return { workspaceId: ws.id, ok: true, prs: prs.length };
}

// Picks a workable GitHub token for the workspace: walk admins, return the
// first one whose provider_token is stored. Falls back to the env-level
// GITHUB_TOKEN so single-tenant self-hosted deployments still work.
async function resolveWorkspaceToken(
  workspaceId: string,
  supabase: ReturnType<typeof createSupabaseAdminClient>,
): Promise<string | null> {
  const { data: admins } = await supabase
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('role', 'admin');

  if (admins && admins.length > 0) {
    const ids = admins.map((a) => a.user_id);
    const { data: tokens } = await supabase
      .from('user_github_tokens')
      .select('provider_token')
      .in('user_id', ids)
      .limit(1);
    const token = tokens?.[0]?.provider_token;
    if (token) return token;
  }

  return process.env.GITHUB_TOKEN || null;
}
