#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const JIRA_HOST = 'postsig.atlassian.net';
const PROJECT_KEY = 'PSK';
const KEY_PATTERN = /PSK[-\s_]?(\d+)/gi;
const PR_REF_PATTERN = /(?:\(#(\d+)\)|\bMerge pull request #(\d+)\b)/g;

function extractKeys(text) {
  if (!text) return [];
  return [...text.matchAll(KEY_PATTERN)].map((m) => `PSK-${m[1]}`);
}

try {
  const envPath = path.join(__dirname, '..', '.env.local');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
} catch {}

const { JIRA_EMAIL, JIRA_API_TOKEN } = process.env;

if (!JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('❌ JIRA_EMAIL or JIRA_API_TOKEN not set.');
  console.error(
    '   Token: https://id.atlassian.com/manage-profile/security/api-tokens',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
let limit = Infinity;
if (limitArg) {
  const parsed = parseInt(limitArg.split('=')[1], 10);
  if (!Number.isNaN(parsed)) limit = parsed;
}
const positional = args.filter((a) => !a.startsWith('--'));
const command = positional[0];

function usage() {
  console.error('Usage:');
  console.error(
    '  jira-sync.js promote <from-status> <to-status> <old-ref> <new-ref> [--dry-run]',
  );
  console.error(
    '  jira-sync.js archive <from-status> <to-status> [--dry-run] [--limit=N]',
  );
  process.exit(1);
}

if (!command) usage();
if (dryRun) console.log('🧪 DRY RUN — no tickets will be transitioned\n');

const auth =
  'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');
const baseHeaders = {
  Authorization: auth,
  Accept: 'application/json',
  'Content-Type': 'application/json',
};

const normalize = (s) => s.replace(/\s+/g, '').toLowerCase();

const REQUEST_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function jira(pathSuffix, init = {}) {
  const res = await fetchWithTimeout(
    `https://${JIRA_HOST}/rest/api/3${pathSuffix}`,
    {
      ...init,
      headers: { ...baseHeaders, ...(init.headers ?? {}) },
    },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `${init.method ?? 'GET'} ${pathSuffix} -> ${res.status} ${body.slice(0, 200)}`,
    );
  }
  return res.status === 204 ? null : res.json();
}

async function transitionIfMatching(
  key,
  fromStatus,
  toStatus,
  currentStatusHint,
) {
  try {
    const status =
      currentStatusHint ??
      (await jira(`/issue/${key}?fields=status`)).fields.status.name;

    if (normalize(status) !== normalize(fromStatus)) {
      console.log(`  ${key}: skip (status: ${status})`);
      return;
    }

    const { transitions } = await jira(`/issue/${key}/transitions`);
    const target = transitions.find(
      (t) => normalize(t.to.name) === normalize(toStatus),
    );

    if (!target) {
      const available =
        transitions.map((t) => t.to.name).join(', ') || '(none)';
      process.exitCode = 1;
      console.log(
        `  ${key}: ⚠️  no transition to "${toStatus}". Available: ${available}`,
      );
      return;
    }

    if (dryRun) {
      console.log(
        `  ${key}: 🧪 would transition ${status} → ${target.to.name}`,
      );
      return;
    }

    await jira(`/issue/${key}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: target.id } }),
    });
    console.log(`  ${key}: ✅ ${status} → ${target.to.name}`);
  } catch (err) {
    process.exitCode = 1;
    console.log(`  ${key}: ❌ ${err.message}`);
  }
}

function getRepo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execSync('git config --get remote.origin.url', {
      encoding: 'utf8',
    }).trim();
    const m = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (m) return `${m[1]}/${m[2]}`;
  } catch {}
  return null;
}

async function fetchKeysFromPRs(prNumbers) {
  if (prNumbers.length === 0) return [];

  const token = process.env.GITHUB_TOKEN;
  const repo = getRepo();

  if (!token) {
    console.log(
      `(skipping PR lookup for ${prNumbers.length} PR(s): GITHUB_TOKEN not set)`,
    );
    return [];
  }
  if (!repo) {
    console.log(`(skipping PR lookup: cannot determine repo)`);
    return [];
  }

  const keys = new Set();
  for (const num of prNumbers) {
    try {
      const res = await fetchWithTimeout(
        `https://api.github.com/repos/${repo}/pulls/${num}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
          },
        },
      );
      if (!res.ok) {
        console.log(`  PR #${num}: ⚠️  fetch failed (${res.status})`);
        continue;
      }
      const pr = await res.json();
      const text = `${pr.head?.ref ?? ''} ${pr.title ?? ''} ${pr.body ?? ''}`;
      for (const k of extractKeys(text)) keys.add(k);
    } catch (err) {
      console.log(`  PR #${num}: ⚠️  ${err.message}`);
    }
  }
  return [...keys];
}

async function promote(fromStatus, toStatus, oldRef, newRef) {
  const log = execFileSync(
    'git',
    ['log', `${oldRef}..${newRef}`, '--format=%B'],
    { encoding: 'utf8' },
  );

  const fromCommits = new Set(extractKeys(log));
  const prNumbers = [
    ...new Set([...log.matchAll(PR_REF_PATTERN)].map((m) => m[1] ?? m[2])),
  ];
  const fromPRs = new Set(await fetchKeysFromPRs(prNumbers));

  const keys = [...new Set([...fromCommits, ...fromPRs])];

  if (keys.length === 0) {
    console.log(`No ${PROJECT_KEY}-* tickets found in ${oldRef}..${newRef}`);
    return;
  }

  const onlyFromPRs = [...fromPRs].filter((k) => !fromCommits.has(k));
  console.log(`Promoting "${fromStatus}" → "${toStatus}"`);
  console.log(`Found ${keys.length} ticket(s): ${keys.join(', ')}`);
  if (onlyFromPRs.length > 0) {
    console.log(
      `  (${onlyFromPRs.length} found via PR lookup: ${onlyFromPRs.join(', ')})`,
    );
  }

  for (const key of keys) {
    await transitionIfMatching(key, fromStatus, toStatus);
  }
}

async function searchAll(jql, max = Infinity) {
  const all = [];
  let nextPageToken;
  do {
    const remaining = max - all.length;
    if (remaining <= 0) break;
    const body = {
      jql,
      fields: ['status'],
      maxResults: Math.min(100, remaining),
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const data = await jira('/search/jql', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    all.push(...(data.issues ?? []));
    nextPageToken = data.nextPageToken;
  } while (nextPageToken && all.length < max);
  return all.slice(0, max);
}

async function resolveStatusName(approxName) {
  const all = await jira('/status');
  const match = all.find((s) => normalize(s.name) === normalize(approxName));
  if (!match) {
    const names = [...new Set(all.map((s) => s.name))].sort();
    throw new Error(
      `No Jira status matches "${approxName}". Available: ${names.join(', ')}`,
    );
  }
  return match.name;
}

async function archive(fromStatus, toStatus) {
  const actualFrom = await resolveStatusName(fromStatus);
  const jql = `project = ${PROJECT_KEY} AND status = "${actualFrom.replace(/"/g, '\\"')}" ORDER BY created ASC`;
  const issues = await searchAll(jql, limit);

  if (issues.length === 0) {
    console.log(`No tickets currently in "${actualFrom}"`);
    return;
  }

  console.log(`Archiving "${actualFrom}" → "${toStatus}"`);
  console.log(
    `Found ${issues.length} ticket(s) to archive${limit !== Infinity ? ` (limited to ${limit})` : ''}`,
  );

  for (const issue of issues) {
    await transitionIfMatching(
      issue.key,
      actualFrom,
      toStatus,
      issue.fields.status.name,
    );
  }
}

(async () => {
  if (command === 'promote') {
    const [, fromStatus, toStatus, oldRef, newRef] = positional;
    if (!fromStatus || !toStatus || !oldRef || !newRef) usage();
    await promote(fromStatus, toStatus, oldRef, newRef);
  } else if (command === 'archive') {
    const [, fromStatus, toStatus] = positional;
    if (!fromStatus || !toStatus) usage();
    await archive(fromStatus, toStatus);
  } else {
    usage();
  }
})().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
