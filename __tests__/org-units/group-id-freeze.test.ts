import * as fs from 'fs';
import * as path from 'path';

/**
 * PSK-1846 phase 1 froze `org_employees.group_id` and `contract_users.
 * group_id`: business-group membership lives on org_units nodes, and the
 * columns are kept only for rollback. This gate greps production source so a
 * new reader or writer of the frozen columns cannot land unnoticed.
 *
 * The allowlist names every file still permitted to mention `group_id` — the
 * ACL tables' own column of the same name (group_members, contract_acl_group,
 * folder_acl_group) plus the one documented legacy fallback. File-granular by
 * design: a tripwire, not a proof.
 */

const ROOT = path.resolve(__dirname, '..', '..');

const SCANNED_DIRS = [
  'app',
  'components',
  'constants',
  'contexts',
  'data',
  'emails',
  'hooks',
  'lib',
  'stores',
  'utils',
];

const ALLOWED_FILES = new Set([
  // ACL sense: contract_acl_group rows paired with the sharing group list.
  'app/(app)/(cpm)/upload/CpmRowEditContext.tsx',
  // ACL sense: group_members management.
  'app/lib/actions/organization-groups.ts',
  'app/lib/mcp/tools/cpm/groups.ts',
  'data/superuser/groups.ts',
  'lib/v2/chat/tools/groups.ts',
  'lib/v2/groups/service.ts',
  // ACL sense: contract_acl_group / folder_acl_group embeds.
  'data/superuser/contracts.ts',
  'data/superuser/folders.ts',
  // ACL sense: the backfill mirror reads contract_acl_group /
  // folder_acl_group group ids to snapshot legacy shares into allocations.
  'lib/v2/cost-allocation/legacy-backfill.ts',
  // Documented legacy fallback: resolves frozen group_id for rows never
  // walked into the tree (pre-backfill employees).
  'lib/v2/org-units/sync.ts',
]);

// prompt_group_id-style columns never match: `_` before `group_id` is a word
// character, so the boundary fails.
const GROUP_ID = /(^|[^A-Za-z0-9_])group_id/;

// The HR-sense join marker: any groups(...) projection carrying `name` inside
// a contract_users or org_employees select body, whatever the field order,
// with or without PostgREST's `alias:` prefix and chained `!inner`/`!fk`
// modifiers. ACL embeds select `public_uuid`, which this deliberately
// excludes.
const HR_TABLE_EMBED = /\b(contract_users|org_employees)(!\w+)*\s*\(/g;
const HR_GROUPS_JOIN =
  /\bgroups(!\w+)*\s*\((?![^)]*\bpublic_uuid\b)[^)]*\bname\b[^)]*\)/;

// Walks each embed's parenthesized body so the join is caught however the
// select string wraps — the MCP select spans several lines.
function hasHrGroupsEmbed(source: string): boolean {
  for (const match of source.matchAll(HR_TABLE_EMBED)) {
    const start = (match.index ?? 0) + match[0].length;
    let depth = 1;
    let i = start;
    while (i < source.length && depth > 0) {
      if (source[i] === '(') depth += 1;
      else if (source[i] === ')') depth -= 1;
      i += 1;
    }
    if (HR_GROUPS_JOIN.test(source.slice(start, i))) return true;
  }
  return false;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

function scan(matches: (source: string) => boolean): string[] {
  const hits: string[] = [];
  for (const dir of SCANNED_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      if (matches(fs.readFileSync(file, 'utf8'))) {
        hits.push(path.relative(ROOT, file));
      }
    }
  }
  return hits.sort();
}

describe('group_id freeze gate', () => {
  it('no file outside the ACL allowlist mentions group_id', () => {
    const offenders = scan((s) => GROUP_ID.test(s)).filter(
      (f) => !ALLOWED_FILES.has(f),
    );
    expect(offenders).toEqual([]);
  });

  it('every allowlisted file still exists (stale entries must be pruned)', () => {
    const missing = [...ALLOWED_FILES].filter(
      (f) => !fs.existsSync(path.join(ROOT, f)),
    );
    expect(missing).toEqual([]);
  });

  it('no select embeds the HR-sense groups(id, name) join anywhere', () => {
    expect(scan(hasHrGroupsEmbed)).toEqual([]);
  });
});

describe('hasHrGroupsEmbed', () => {
  it('catches the join on a single-line select', () => {
    expect(
      hasHrGroupsEmbed(
        "select('id, contract_users ( id, group_id, groups (id, name) )')",
      ),
    ).toBe(true);
  });

  it('catches the join when the select body spans lines', () => {
    expect(
      hasHrGroupsEmbed(`
        const SELECT = \`
          id, name,
          org_employees (
            id, first_name,
            group_id, groups ( id, name ),
            status
          )
        \`;`),
    ).toBe(true);
  });

  it('catches reordered and widened projections', () => {
    expect(
      hasHrGroupsEmbed("select('contract_users ( id, groups ( name, id ) )')"),
    ).toBe(true);
    expect(
      hasHrGroupsEmbed(
        "select('org_employees ( id, groups ( id, name, created_at ) )')",
      ),
    ).toBe(true);
  });

  it('catches aliased and modifier-qualified relation embeds', () => {
    expect(
      hasHrGroupsEmbed(
        "select('contract_users ( groups!contract_users_group_id_fkey(name) )')",
      ),
    ).toBe(true);
    expect(
      hasHrGroupsEmbed(
        "select('org_employees ( group:groups!inner!org_employees_group_id_fkey(id, name) )')",
      ),
    ).toBe(true);
    expect(
      hasHrGroupsEmbed(
        "select('contract_users!inner!contract_users_contract_id_fkey ( id, groups(name) )')",
      ),
    ).toBe(true);
  });

  it('ignores ACL embeds and the public_uuid form', () => {
    expect(
      hasHrGroupsEmbed(
        'contract_acl_group ( group_id, groups ( id, name ) ), contract_users ( *, groups ( id, name, public_uuid ) )',
      ),
    ).toBe(false);
  });
});
