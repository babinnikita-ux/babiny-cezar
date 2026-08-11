import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  BabinyAdapter,
  activeProfileForRun,
  buildTaskSteps,
  parseJobSpec,
  progressForRun,
  safeSetupCommands,
  sanitizeBlocker,
  verifyBearerAuthorization,
  verifyGithubSignature,
} from './adapter.mjs';

const SECRET = 'babiny-test-secret-with-enough-entropy';
const STATUS_TOKEN = 'babiny-status-test-token-with-enough-entropy';

function config(root) {
  return {
    cezarBaseUrl: 'http://127.0.0.1:4321',
    bindHost: '127.0.0.1',
    port: 4371,
    stateFile: join(root, 'state.json'),
    webhookSecretFile: join(root, 'secret'),
    statusTokenFile: join(root, 'status-token'),
    repos: {
      'babinnikita-ux/family-bot': {
        projectId: 'family-bot', projectPath: '/srv/babiny-cezar/projects/family-bot',
        primary: 'claude', reviewer: 'codex', baseBranch: 'main',
        setupCommands: [
          'python3 -m venv .venv',
          '.venv/bin/python -m pip install --disable-pip-version-check --no-input --timeout 60 --retries 2 -e ".[dev]"',
        ],
        gate: '.venv/bin/python -m pytest -q',
      },
      'babinnikita-ux/family-hub': {
        projectId: 'family-hub', projectPath: '/srv/babiny-cezar/projects/family-hub',
        primary: 'claude', reviewer: 'codex', baseBranch: 'main', gate: 'git diff --check',
      },
    },
  };
}

test('status API requires the dedicated bearer token while health stays public', async () => {
  const root = await mkdtemp(join(tmpdir(), 'babiny-adapter-status-auth-'));
  let adapter;
  try {
    await writeFile(join(root, 'secret'), SECRET, { mode: 0o600 });
    await writeFile(join(root, 'status-token'), STATUS_TOKEN, { mode: 0o600 });
    adapter = new BabinyAdapter({ ...config(root), port: 4379, reconcileSeconds: 300 }, {
      gh: async () => JSON.stringify({ items: [] }),
    });
    await adapter.start();

    const baseUrl = 'http://127.0.0.1:4379';
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);

    const anonymous = await fetch(`${baseUrl}/api/status`);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), { error: 'unauthorized' });

    const wrong = await fetch(`${baseUrl}/api/status`, {
      headers: { authorization: 'Bearer definitely-wrong-status-token' },
    });
    assert.equal(wrong.status, 401);

    const wrongScheme = await fetch(`${baseUrl}/api/status`, {
      headers: { authorization: `Basic ${STATUS_TOKEN}` },
    });
    assert.equal(wrongScheme.status, 401);

    const authorized = await fetch(`${baseUrl}/api/status`, {
      headers: { authorization: `Bearer ${STATUS_TOKEN}` },
    });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), { tasks: [] });

    const aliasWithoutToken = await fetch(`${baseUrl}/status`);
    assert.equal(aliasWithoutToken.status, 401);
  } finally {
    await adapter?.stop();
    await rm(root, { recursive: true, force: true });
  }
});

test('status bearer parser rejects malformed credentials', () => {
  assert.equal(verifyBearerAuthorization(`Bearer ${STATUS_TOKEN}`, STATUS_TOKEN), true);
  assert.equal(verifyBearerAuthorization(`bearer ${STATUS_TOKEN}`, STATUS_TOKEN), true);
  assert.equal(verifyBearerAuthorization(`Bearer  ${STATUS_TOKEN}`, STATUS_TOKEN), false);
  assert.equal(verifyBearerAuthorization(`Bearer ${STATUS_TOKEN} trailing`, STATUS_TOKEN), false);
  assert.equal(verifyBearerAuthorization(`Basic ${STATUS_TOKEN}`, STATUS_TOKEN), false);
  assert.equal(verifyBearerAuthorization('Bearer too-short', STATUS_TOKEN), false);
  assert.equal(verifyBearerAuthorization(undefined, STATUS_TOKEN), false);
});

test('adapter fails closed before listening when the status token is unavailable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'babiny-adapter-status-missing-'));
  const adapter = new BabinyAdapter({ ...config(root), port: 4380, reconcileSeconds: 300 });
  try {
    await writeFile(join(root, 'secret'), SECRET, { mode: 0o600 });
    await assert.rejects(adapter.start(), { code: 'bad_status_token' });
  } finally {
    await adapter.stop();
    await rm(root, { recursive: true, force: true });
  }
});

function webhookPayload(body = '<!-- BABINY_AGENT_JOB_V1 -->\nPlease fix the issue.') {
  return {
    action: 'opened',
    repository: { full_name: 'babinnikita-ux/family-bot' },
    issue: {
      number: 42,
      title: 'Disposable adapter test task',
      body,
      labels: [{ name: 'agent-job' }],
      updated_at: '2026-08-10T09:00:00Z',
      html_url: 'https://github.com/babinnikita-ux/family-bot/issues/42',
    },
  };
}

function signed(body, delivery = 'delivery-1') {
  return {
    'x-github-event': 'issues',
    'x-github-delivery': delivery,
    'x-hub-signature-256': `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`,
  };
}

test('GitHub signature validation is strict and constant-shape', () => {
  const body = '{"ok":true}';
  const signature = `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;
  assert.equal(verifyGithubSignature(body, signature, SECRET), true);
  assert.equal(verifyGithubSignature(body, `${signature.slice(0, -1)}0`, SECRET), false);
  assert.equal(verifyGithubSignature(body, 'sha1=deadbeef', SECRET), false);
  assert.equal(verifyGithubSignature(body, signature, 'short'), false);
});

test('signed GitHub ping is acknowledged without creating a task', async () => {
  const root = await mkdtemp(join(tmpdir(), 'babiny-adapter-ping-'));
  try {
    await writeFile(join(root, 'secret'), SECRET, { mode: 0o600 });
    const adapter = new BabinyAdapter({ ...config(root), webhookSecretFile: join(root, 'secret') });
    await adapter.init();
    const body = JSON.stringify({ zen: 'keep it simple' });
    const headers = { ...signed(body, 'ping-1'), 'x-github-event': 'ping' };
    const result = await adapter.handleWebhook(headers, body);
    assert.deepEqual(result, { accepted: true, ping: true });
    assert.equal(adapter.status().tasks.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('task definition supports compatibility marker and manual routing without fallback', () => {
  const body = '<!-- BABINY_AGENT_JOB_V1 {"target_repo":"babinnikita-ux/family-hub","primary":"claude","reviewer":"codex","base_branch":"develop","deploy_permission":"none","mode":"autopilot"} -->';
  const parsed = parseJobSpec(body, {
    targetRepo: 'babinnikita-ux/family-bot', primary: 'codex', reviewer: 'claude', baseBranch: 'main', mode: 'autopilot', deployPermission: 'none',
  }, ['babinnikita-ux/family-bot', 'babinnikita-ux/family-hub']);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.spec, {
    targetRepo: 'babinnikita-ux/family-hub', primary: 'claude', reviewer: 'codex', baseBranch: 'develop', mode: 'autopilot', deployPermission: 'none',
  });
  assert.equal(parseJobSpec('target_repo: evil/not-allowlisted', parsed.spec, ['babinnikita-ux/family-bot']).ok, false);
});

test('task definition accepts the legacy BABINY_AGENT_JOB_V1 aliases', () => {
  const body = '<!-- BABINY_AGENT_JOB_V1 {"target_repo":"babinnikita-ux/family-hub","mode":"implement","primary_agent":"auto","reviewer_agent":"auto","base_branch":"main","deploy":"forbidden"} -->';
  const parsed = parseJobSpec(body, {
    targetRepo: 'babinnikita-ux/babiny-agent-orchestrator', primary: 'claude', reviewer: 'codex',
    baseBranch: 'develop', mode: 'autopilot', deployPermission: 'none',
    routeDefaults: { 'babinnikita-ux/family-hub': { primary: 'codex', reviewer: 'claude', baseBranch: 'main', deployPermission: 'none' } },
  }, ['babinnikita-ux/babiny-agent-orchestrator', 'babinnikita-ux/family-hub']);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.spec, {
    targetRepo: 'babinnikita-ux/family-hub', primary: 'codex', reviewer: 'claude',
    baseBranch: 'main', mode: 'implementation', deployPermission: 'none',
  });
});

test('task definition accepts legacy reviewer=auto with implementation mode', () => {
  const body = '<!-- BABINY_AGENT_JOB_V1 {"target_repo":"babinnikita-ux/babiny-agent-orchestrator","mode":"implement","primary_agent":"claude","reviewer":"auto","base_branch":"main","deploy":"forbidden"} -->';
  const parsed = parseJobSpec(body, {
    targetRepo: 'babinnikita-ux/family-bot', primary: 'codex', reviewer: 'claude', baseBranch: 'main', mode: 'autopilot', deployPermission: 'none',
    routeDefaults: { 'babinnikita-ux/babiny-agent-orchestrator': { primary: 'codex', reviewer: 'claude', baseBranch: 'main', deployPermission: 'none' } },
  }, ['babinnikita-ux/family-bot', 'babinnikita-ux/babiny-agent-orchestrator']);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.spec.primary, 'claude');
  assert.equal(parsed.spec.reviewer, 'claude');
  assert.equal(parsed.spec.mode, 'implementation');
});

test('workflow profile pins models, effort, read-only review, and bounded retries', () => {
  const steps = buildTaskSteps({ repository: 'babinnikita-ux/family-bot', number: 42, title: 't', body: 'b' }, {
    targetRepo: 'babinnikita-ux/family-bot', primary: 'claude', reviewer: 'codex', baseBranch: 'main', mode: 'autopilot', deployPermission: 'none',
  }, 'npm test');
  assert.equal(steps[0].model, 'claude-sonnet-5');
  assert.equal(steps[0].effort, 'high');
  assert.equal(steps[2].model, 'gpt-5.6-luna');
  assert.equal(steps[2].effort, 'max');
  assert.equal(steps[2].agentMode, 'review');
  assert.deepEqual(steps[2].allowedTools, ['Read', 'Grep', 'Glob']);
  assert.equal(steps[2].bashAllowlist, undefined);
  assert.match(steps[2].prompt, /read-only inspection commands/);
  assert.match(steps[2].prompt, /exactly CEZ:DONE/);
  assert.doesNotMatch(steps[2].prompt, /do not .*run commands\./);
  assert.equal(steps[1].onFail.max, 2);
  assert.equal(steps[4].onFail.max, 2);
  assert.equal(JSON.stringify(steps).includes('danger-full-access'), false);
});

test('versioned family-bot route is Python-only and bootstraps an isolated venv', async () => {
  const example = JSON.parse(await readFile(new URL('./adapter.example.json', import.meta.url), 'utf8'));
  const route = example.repos['babinnikita-ux/family-bot'];
  assert.equal(route.gate, '.venv/bin/python -m pytest -q');
  assert.deepEqual(route.setupCommands, [
    'python3 -m venv .venv',
    '.venv/bin/python -m pip install --disable-pip-version-check --no-input --timeout 60 --retries 2 -e ".[dev]"',
  ]);
  assert.notEqual(route.gate, 'npm test');
  assert.deepEqual(safeSetupCommands(route.setupCommands), route.setupCommands);
});

test('family-bot setup runs before implementation and local gate', () => {
  const steps = buildTaskSteps({ repository: 'babinnikita-ux/family-bot', number: 19, title: 't', body: 'b' }, {
    targetRepo: 'babinnikita-ux/family-bot', primary: 'claude', reviewer: 'codex', baseBranch: 'main', mode: 'autopilot', deployPermission: 'none',
  }, '.venv/bin/python -m pytest -q', [
    'python3 -m venv .venv',
    '.venv/bin/python -m pip install --disable-pip-version-check --no-input --timeout 60 --retries 2 -e ".[dev]"',
  ]);
  assert.deepEqual(steps.slice(0, 2).map(({ id, command }) => ({ id, command })), [
    { id: 'setup-1', command: 'python3 -m venv .venv' },
    { id: 'setup-2', command: '.venv/bin/python -m pip install --disable-pip-version-check --no-input --timeout 60 --retries 2 -e ".[dev]"' },
  ]);
  assert.equal(steps[2].id, 'implement');
  assert.equal(steps[3].command, '.venv/bin/python -m pytest -q');
  assert.equal(steps[3].onFail.max, 2);
});

test('safe status profile exposes only allowlisted active agent/model/role', () => {
  assert.deepEqual(activeProfileForRun({ status: 'running', currentStepId: 'implement' }, {
    primary: 'claude', reviewer: 'codex',
  }), { activeAgent: 'claude', activeModel: 'claude-sonnet-5', activeRole: 'implementation' });
  assert.deepEqual(activeProfileForRun({ status: 'running', currentStepId: 'final-review' }, {
    primary: 'claude', reviewer: 'codex',
  }), { activeAgent: 'codex', activeModel: 'gpt-5.6-luna', activeRole: 'review' });
  assert.deepEqual(activeProfileForRun({ status: 'running', currentStepId: 'gate-1' }, {
    primary: 'claude', reviewer: 'codex',
  }), {});
  assert.deepEqual(activeProfileForRun({ status: 'done', currentStepId: 'final-review' }, {
    primary: 'claude', reviewer: 'codex',
  }), {});
});

test('local gate allowlist supports the documented src-layout Python test command', () => {
  const candidate = { repository: 'babinnikita-ux/babiny-agent-orchestrator', number: 35, title: 't', body: 'b' };
  const spec = {
    targetRepo: 'babinnikita-ux/babiny-agent-orchestrator', primary: 'codex', reviewer: 'claude',
    baseBranch: 'main', mode: 'autopilot', deployPermission: 'none',
  };
  assert.equal(buildTaskSteps(candidate, spec, 'PYTHONPATH=src python3 -m unittest discover -s tests -v')[1].command,
    'PYTHONPATH=src python3 -m unittest discover -s tests -v');
  assert.equal(buildTaskSteps(candidate, spec, 'PYTHONPATH=/etc python3 -m unittest discover -s tests -v')[1].command,
    'git diff --check');
});

test('status sanitization and progress never return raw agent details', () => {
  const blocker = sanitizeBlocker('Error: /srv/babiny-cezar/state/runs/secret\nBearer ghp_abcdefghijklmnopqrstuvwxyz0123456789');
  assert.equal(blocker.includes('ghp_'), false);
  assert.equal(blocker.includes('\n'), false);
  assert.ok(blocker.length <= 240);
  assert.deepEqual(progressForRun({ status: 'running', currentStepId: 'review' }), { stage: 'review', progress: 52 });
  assert.deepEqual(progressForRun({ status: 'done' }), { stage: 'complete', progress: 100 });
});

test('webhook intake is idempotent and reconciliation can retry a missing delivery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'babiny-adapter-'));
  try {
    await writeFile(join(root, 'secret'), SECRET, { mode: 0o600 });
    const calls = { post: 0 };
    let run = { id: 'run-42', status: 'queued', steps: [] };
    const fetchImpl = async (url, init = {}) => {
      const path = new URL(url).pathname;
      if (path === '/api/v1/projects') return new Response(JSON.stringify({ projects: [{ id: 'family-bot', root: '/srv/babiny-cezar/projects/family-bot' }] }), { status: 200 });
      if (path.endsWith('/runs') && init.method === 'POST') {
        calls.post += 1;
        run = { id: 'run-42', status: 'queued', steps: [] };
        return new Response(JSON.stringify(run), { status: 201 });
      }
      if (path.endsWith('/runs/run-42')) return new Response(JSON.stringify(run), { status: 200 });
      return new Response(JSON.stringify({ error: 'unexpected' }), { status: 404 });
    };
    const adapter = new BabinyAdapter({ ...config(root), webhookSecretFile: join(root, 'secret') }, {
      fetchImpl,
      gh: async () => JSON.stringify({ items: [] }),
    });
    await adapter.init();
    const payload = JSON.stringify(webhookPayload());
    const first = await adapter.handleWebhook(signed(payload), payload);
    const second = await adapter.handleWebhook(signed(payload), payload);
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(calls.post, 1);
    const status = adapter.status();
    assert.equal(status.tasks[0].taskId, 'run-42');
    assert.equal('prompt' in status.tasks[0], false);
    assert.equal('spec' in status.tasks[0], false);

    // A transient Cezar/provider failure must not make the exact same
    // delivery permanently idempotent: reconciliation can retry it after
    // the prerequisite recovers, while successful deliveries stay duplicate.
    const retryRoot = await mkdtemp(join(tmpdir(), 'babiny-adapter-retry-'));
    try {
      await writeFile(join(retryRoot, 'secret'), SECRET, { mode: 0o600 });
      let failOnce = true;
      let retryPosts = 0;
      const retryFetch = async (url, init = {}) => {
        const path = new URL(url).pathname;
        if (path === '/api/v1/projects') return new Response(JSON.stringify({ projects: [{ id: 'family-bot', root: '/srv/babiny-cezar/projects/family-bot' }] }), { status: 200 });
        if (path.endsWith('/runs') && init.method === 'POST') {
          retryPosts += 1;
          if (failOnce) {
            failOnce = false;
            return new Response(JSON.stringify({ error: 'provider unavailable' }), { status: 409 });
          }
          return new Response(JSON.stringify({ id: 'run-retried', status: 'queued', steps: [] }), { status: 201 });
        }
        if (path.endsWith('/runs/run-retried')) return new Response(JSON.stringify({ id: 'run-retried', status: 'queued', steps: [] }), { status: 200 });
        return new Response(JSON.stringify({ error: 'unexpected' }), { status: 404 });
      };
      const retryAdapter = new BabinyAdapter({ ...config(retryRoot), stateFile: join(retryRoot, 'state.json'), webhookSecretFile: join(retryRoot, 'secret') }, { fetchImpl: retryFetch });
      await retryAdapter.init();
      const retryBody = JSON.stringify(webhookPayload());
      const firstRetry = await retryAdapter.handleWebhook(signed(retryBody, 'transient-1'), retryBody);
      const secondRetry = await retryAdapter.handleWebhook(signed(retryBody, 'transient-1'), retryBody);
      assert.equal(firstRetry.task.status, 'queued');
      assert.equal(secondRetry.duplicate, false);
      assert.equal(retryPosts, 2);
      assert.equal(retryAdapter.status().tasks[0].taskId, 'run-retried');
    } finally {
      await rm(retryRoot, { recursive: true, force: true });
    }

    // Simulate a missed webhook with a fresh adapter state and let the
    // reconciler discover the same issue through GitHub search.
    const missedRoot = await mkdtemp(join(tmpdir(), 'babiny-adapter-reconcile-'));
    try {
      await writeFile(join(missedRoot, 'secret'), SECRET, { mode: 0o600 });
      const reconciler = new BabinyAdapter({ ...config(missedRoot), stateFile: join(missedRoot, 'state.json'), webhookSecretFile: join(missedRoot, 'secret') }, {
        fetchImpl,
        gh: async (args) => args[0] === 'api' && String(args[1]).startsWith('search/issues')
          ? JSON.stringify({ items: [webhookPayload().issue] })
          : JSON.stringify({ items: [] }),
      });
      await reconciler.init();
      await reconciler.reconcileIssues();
      assert.equal(calls.post, 2);
    } finally {
      await rm(missedRoot, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
