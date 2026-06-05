import { SupabaseStoreAdapter } from '@/lib/adapters/supabase-store';
import { loadWorkspaceConfig } from '@/lib/load-workspace-config';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, SyncCounts, SyncErrorKind, SyncPhase, SyncStatusState } from '@/lib/supabase/types';
import { classifySyncError } from './classify-sync-error';

// ─────────────────────────────────────────────────────────────────────
// Shared workspace-sync core — the four-phase "pull from GitHub" pipeline
// (fetch issues → digest → fetch comments → refresh PRs), factored out of
// the Inbox `syncAndDigest` server action so BOTH that action AND a future
// cron/job worker can run the exact same sync, writing progress into the
// `sync_status` table.
//
// This is a plain server-side lib (NOT a `'use server'` file), so it can
// export constants + helpers in addition to async functions.
// ─────────────────────────────────────────────────────────────────────

/** A `syncing` row older than this is treated as stale (e.g. the container
 *  restarted mid-sync) and may be overwritten by a fresh sync. */
export const STALE_SYNC_MS = 10 * 60 * 1000;

export async function writeSyncStatus(
  supabase: SupabaseClient<Database>,
  workspaceId: string,
  patch: {
    status: SyncStatusState;
    phase?: SyncPhase | null;
    message?: string | null;
    counts?: SyncCounts;
    error?: string | null;
    /** Classification of the failure (migration 0041), written alongside
     *  status='error' so the indicator can show a recovery CTA. */
    error_kind?: SyncErrorKind | null;
    /** Flags the first full import (migration 0040) so the indicator shows a
     *  determinate progress bar. Threaded from `runSyncPhases` once phase 1
     *  has computed `fullSync`. */
    initial?: boolean;
    started_at?: string | null;
    finished_at?: string | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from('sync_status')
    .upsert({ workspace_id: workspaceId, ...patch }, { onConflict: 'workspace_id' });
  if (error) console.warn('[sync] sync_status write failed:', error.message);
}

export interface BuildSyncContextArgs {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  repoOwner: string;
  repoName: string;
  token: string;
}

export interface SyncContext {
  store: Awaited<ReturnType<(typeof import('@cezar/core'))['IssueStore']['fromPort']>>;
  github: InstanceType<(typeof import('@cezar/core'))['GitHubService']>;
  config: Awaited<ReturnType<typeof loadWorkspaceConfig>>;
}

/** Build the store / config / github trio used to run a workspace sync.
 *  Tolerates an empty store (newly-connected workspace) by seeding an empty
 *  one. Throws on config-load failure — callers handle. */
export async function buildSyncContext({
  supabase,
  workspaceId,
  repoOwner,
  repoName,
  token,
}: BuildSyncContextArgs): Promise<SyncContext> {
  const core = await import('@cezar/core');

  const adapter = new SupabaseStoreAdapter(supabase, workspaceId);

  // The store may be empty for a newly-connected workspace; tolerate that
  // by seeding an empty store rather than failing the sync.
  let store: Awaited<ReturnType<typeof core.IssueStore.fromPort>>;
  try {
    store = await core.IssueStore.fromPort(adapter);
  } catch {
    store = await core.IssueStore.fromPort({
      async load() {
        return {
          meta: {
            owner: repoOwner,
            repo: repoName,
            lastSyncedAt: null,
            fullSyncedAt: null,
            totalFetched: 0,
            version: 1 as const,
            orgMembers: [],
            orgMembersFetchedAt: null,
          },
          issues: [],
        };
      },
      async save(data) {
        await adapter.save(data);
      },
    });
  }

  const config = await loadWorkspaceConfig(workspaceId, supabase, {
    githubToken: token,
    repoOwner,
    repoName,
  });

  const github = new core.GitHubService(config);

  return { store, github, config };
}

export interface RunSyncPhasesArgs {
  supabase: SupabaseClient<Database>;
  workspaceId: string;
  store: Awaited<ReturnType<(typeof import('@cezar/core'))['IssueStore']['fromPort']>>;
  github: InstanceType<(typeof import('@cezar/core'))['GitHubService']>;
  config: Awaited<ReturnType<typeof loadWorkspaceConfig>>;
}

/** The four serial sync phases, each writing its progress into `sync_status`.
 *  Phase 1 is fatal-on-error; phases 2–4 are best-effort (warn + continue)
 *  so a digest/comment/PR hiccup still produces a usable sync. */
export async function runSyncPhases({
  supabase,
  workspaceId,
  store,
  github,
  config,
}: RunSyncPhasesArgs): Promise<void> {
  const { LLMService } = await import('@cezar/core');
  const counts: SyncCounts = {};
  // Whether this run is the workspace's first full (all-states) import. Set in
  // phase 1 and threaded into every `sync_status` write from there on, so the
  // indicator can switch to a determinate "Importing" bar.
  let initial = false;
  // Mirror of `initial` (the first all-states import) used to guard the §4
  // delta computation — on a full backfill every PR/issue would count as "new".
  let fullSync = false;

  // ── 1. Fetch issues ──
  // Do a full (all-states, incl. closed) fetch until a complete sync has
  // succeeded, then switch to incremental `since` fetches. The full fetch
  // backfills closed issues — and corrects issues closed upstream — for stores
  // first synced by the older open-only path, and bootstraps new workspaces.
  try {
    const meta = store.getMeta();
    fullSync = !meta.fullSyncedAt || !meta.lastSyncedAt;
    initial = fullSync;
    const issues = fullSync
      ? await github.fetchAllIssues(true)
      : await github.fetchIssuesSince(meta.lastSyncedAt as string, true);
    counts.issuesFetched = issues.length;
    counts.issuesCreated = 0;
    counts.issuesUpdated = 0;
    // Per-run open↔closed deltas (spec §4) — only on incremental syncs; the
    // initial import marks everything as "new" so close/reopen tallies are noise.
    if (!fullSync) {
      counts.issuesClosed = 0;
      counts.issuesReopened = 0;
    }
    for (const issue of issues) {
      const r = store.upsertIssue(issue);
      if (r.action === 'created') counts.issuesCreated += 1;
      if (r.action === 'updated') counts.issuesUpdated += 1;
      // `upsertIssue` reports `stateChanged`; pair it with the incoming state to
      // get the direction. Cheap — no extra read, the diff is already done here.
      if (!fullSync && r.stateChanged) {
        if (issue.state === 'closed') counts.issuesClosed! += 1;
        else counts.issuesReopened! += 1;
      }
    }
    const nowIso = new Date().toISOString();
    store.updateMeta({
      lastSyncedAt: nowIso,
      totalFetched: issues.length,
      // Mark the store complete once the first all-states fetch lands, so
      // later syncs go incremental.
      ...(fullSync ? { fullSyncedAt: nowIso } : {}),
    });
    await store.save();
  } catch (err) {
    await writeSyncStatus(supabase, workspaceId, {
      status: 'error',
      phase: null,
      counts,
      initial,
      error: `Issue fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      error_kind: classifySyncError(err),
      finished_at: new Date().toISOString(),
    });
    return;
  }

  // ── 2. Generate digests for OPEN issues that don't have one yet ──
  // Scoped to open issues: a full backfill can pull in hundreds of historical
  // closed issues, and digesting those would be a large, low-value LLM spend.
  try {
    const needDigest = store.getIssues({ state: 'open', hasDigest: false });
    if (needDigest.length > 0) {
      // Seed the denominator BEFORE the LLM call so the first-import bar has a
      // total to measure against; the bar advances as `onProgress` fires.
      counts.digestsTotal = needDigest.length;
      counts.digestsCreated = 0;
      await writeSyncStatus(supabase, workspaceId, {
        status: 'syncing',
        phase: 'digests',
        message: `Digesting 0/${needDigest.length}…`,
        counts,
        initial,
      });
      const service = new LLMService(config);
      const issueData = needDigest.map((i) => ({ number: i.number, title: i.title, body: i.body }));
      // Wire the (previously-unused) per-batch progress callback to a throttled
      // Realtime write — once per batch, never per-issue — so the import bar
      // advances live without spamming `sync_status`.
      const results = await service.generateDigests(
        issueData,
        config.sync.digestBatchSize,
        (completed, total) => {
          counts.digestsCreated = completed;
          counts.digestsTotal = total;
          void writeSyncStatus(supabase, workspaceId, {
            status: 'syncing',
            phase: 'digests',
            message: `Digesting ${completed}/${total}…`,
            counts,
            initial,
          });
        },
      );
      for (const [number, digest] of results) {
        store.setDigest(number, digest);
      }
      counts.digestsCreated = results.size;
      await store.save();
    }
  } catch (err) {
    // Digest failure shouldn't abort the whole sync — comments + PR pull are
    // still useful, and the user can retry to fill in the rest.
    console.warn('[sync] digest pass failed:', err);
  }

  // ── 3. Fetch comments for open issues that need them ──
  try {
    const needComments = store
      .getIssues({ state: 'open' })
      .filter((i) => !i.commentsFetchedAt && i.commentCount > 0);
    if (needComments.length > 0) {
      await writeSyncStatus(supabase, workspaceId, {
        status: 'syncing',
        phase: 'comments',
        message: `Fetching comments for ${needComments.length} issue${needComments.length === 1 ? '' : 's'}…`,
        counts,
        initial,
      });
      const commentMap = await github.fetchCommentsForIssues(needComments.map((i) => i.number));
      for (const [num, comments] of commentMap) {
        store.setComments(num, comments);
      }
      counts.commentsFetched = commentMap.size;
      await store.save();
    }
  } catch (err) {
    console.warn('[sync] comments pass failed:', err);
  }

  // ── 4. Refresh PRs (all states) into the pull_requests table ──
  try {
    await writeSyncStatus(supabase, workspaceId, {
      status: 'syncing',
      phase: 'prs',
      message: 'Refreshing pull requests…',
      counts,
      initial,
    });
    // All states, newest-activity first, so PRs closed/merged upstream get
    // their state corrected; cap the walk so a repo with thousands of historical
    // PRs doesn't bloat this background pass.
    const prs = await github.listPullRequests(500);
    if (prs.length > 0) {
      // Per-run PR deltas (spec §4) — diff the incoming set against the stored
      // `(number, state)` BEFORE the upsert overwrites it. One indexed select
      // (bounded by the 500-cap window). Skipped on the initial import, where
      // every PR would register as "new". `RawPullRequest` carries no merge
      // signal today, so merges fold into `prsClosed` and `prsMerged` is left
      // unset (see report).
      if (!fullSync) {
        const numbers = prs.map((p) => p.number);
        const { data: priorRows, error: priorErr } = await supabase
          .from('pull_requests')
          .select('number, state')
          .eq('workspace_id', workspaceId)
          .in('number', numbers);
        if (!priorErr) {
          const priorState = new Map<number, 'open' | 'closed'>(
            (priorRows ?? []).map((r) => [r.number, r.state]),
          );
          let created = 0;
          let closed = 0;
          let reopened = 0;
          for (const p of prs) {
            const prev = priorState.get(p.number);
            if (prev === undefined) {
              created += 1;
            } else if (prev === 'open' && p.state === 'closed') {
              closed += 1; // includes merges — no merge flag available
            } else if (prev === 'closed' && p.state === 'open') {
              reopened += 1;
            }
          }
          counts.prsCreated = created;
          counts.prsClosed = closed;
          counts.prsReopened = reopened;
        }
      }
      const rows = prs.map((p) => ({
        workspace_id: workspaceId,
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
      const { error } = await supabase
        .from('pull_requests')
        .upsert(rows, { onConflict: 'workspace_id,number' });
      if (!error) counts.prsUpdated = prs.length;
    }
  } catch (err) {
    console.warn('[sync] PR sync failed:', err);
  }

  // ── Done. ──
  await writeSyncStatus(supabase, workspaceId, {
    status: 'done',
    phase: null,
    message: summarize(counts),
    counts,
    initial,
    error: null,
    error_kind: null,
    finished_at: new Date().toISOString(),
  });
}

function summarize(counts: SyncCounts): string {
  const bits: string[] = [];
  if (counts.issuesFetched) {
    bits.push(
      `${counts.issuesFetched} issue${counts.issuesFetched === 1 ? '' : 's'} (${counts.issuesCreated ?? 0} new · ${counts.issuesUpdated ?? 0} updated)`,
    );
  }
  if (counts.digestsCreated) bits.push(`${counts.digestsCreated} digested`);
  if (counts.commentsFetched) bits.push(`${counts.commentsFetched} commented`);
  if (counts.prsUpdated) bits.push(`${counts.prsUpdated} PR${counts.prsUpdated === 1 ? '' : 's'}`);
  return bits.length > 0 ? `Synced: ${bits.join(' · ')}` : 'Already up to date';
}
