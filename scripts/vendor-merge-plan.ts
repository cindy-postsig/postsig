/**
 * Pure helpers for scripts/merge-duplicate-vendor.ts: argument validation,
 * candidate discovery and survivor suggestion. No I/O, so the CLI's
 * judgement is unit-testable.
 */
import { toFoldKey } from '@/lib/name-matching';
import { removeKnownSuffixes } from '@/app/lib/utils';

export interface VendorRow {
  id: number;
  name: string;
  domain: string | null;
  status: string | null;
  created_at: string | null;
}

export type CandidateReason = 'name' | 'domain';

export interface CandidateGroup {
  key: string;
  reason: CandidateReason;
  vendors: VendorRow[];
}

export interface MergeArgs {
  find: boolean;
  loser: number | null;
  survivor: number | null;
  apply: boolean;
  allowDrops: boolean;
  json: boolean;
  envPath: string;
}

/** Rows current_vendors already resolves to another vendor. */
const RETIRED_STATUSES = new Set(['merged', 'acquired', 'duplicate']);

function parseId(flag: string, value: string | undefined): number {
  const id = Number(value);
  if (!value || !Number.isInteger(id) || id <= 0) {
    throw new Error(flag + ' requires a positive integer vendor id');
  }
  return id;
}

/** Either --find, or both --loser and --survivor; anything else is an error. */
export function parseMergeArgs(argv: string[]): MergeArgs {
  const args: MergeArgs = {
    find: false,
    loser: null,
    survivor: null,
    apply: false,
    allowDrops: false,
    json: false,
    envPath: '.env.local',
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--find') args.find = true;
    else if (flag === '--apply') args.apply = true;
    else if (flag === '--allow-reference-drops') args.allowDrops = true;
    else if (flag === '--json') args.json = true;
    else if (flag === '--loser') args.loser = parseId(flag, argv[++i]);
    else if (flag === '--survivor') args.survivor = parseId(flag, argv[++i]);
    else if (flag === '--env') args.envPath = argv[++i] ?? '';
    else throw new Error('Unknown argument: ' + flag);
  }
  if (!args.envPath) throw new Error('--env requires a value');
  const pair = args.loser !== null && args.survivor !== null;
  if (args.find === pair) {
    throw new Error('Pass either --find, or both --loser and --survivor.');
  }
  if (pair && args.loser === args.survivor) {
    throw new Error('--loser and --survivor must differ.');
  }
  return args;
}

/** Same key getVendorId uses before it decides to create a vendor. */
export function vendorNameKey(name: string): string {
  return toFoldKey(removeKnownSuffixes(name));
}

function domainKey(domain: string | null): string {
  if (!domain) return '';
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '');
}

function groupBy(
  vendors: VendorRow[],
  keyOf: (vendor: VendorRow) => string,
): Map<string, VendorRow[]> {
  const groups = new Map<string, VendorRow[]>();
  for (const vendor of vendors) {
    const key = keyOf(vendor);
    if (!key) continue;
    const members = groups.get(key) ?? [];
    members.push(vendor);
    groups.set(key, members);
  }
  return groups;
}

/**
 * Vendors that look like the same company: identical folded name (suffixes
 * stripped), or identical domain across different folded names. Already
 * retired rows are skipped; they are resolved by current_vendors.
 */
export function findDuplicateCandidates(
  vendors: VendorRow[],
): CandidateGroup[] {
  const live = vendors.filter((v) => !RETIRED_STATUSES.has(v.status ?? ''));
  const result: CandidateGroup[] = [];

  const byName = groupBy(live, (v) => vendorNameKey(v.name));
  for (const [key, members] of byName) {
    if (members.length > 1)
      result.push({ key, reason: 'name', vendors: members });
  }

  const byDomain = groupBy(live, (v) => domainKey(v.domain));
  for (const [key, members] of byDomain) {
    const nameKeys = new Set(members.map((v) => vendorNameKey(v.name)));
    if (members.length > 1 && nameKeys.size > 1) {
      result.push({ key, reason: 'domain', vendors: members });
    }
  }

  for (const group of result) group.vendors.sort((a, b) => a.id - b.id);
  return result.sort((a, b) => a.vendors[0].id - b.vendors[0].id);
}

/**
 * The row with the most contracts keeps its id (fewest rows to repoint,
 * fewest stale links); ties go to the oldest id.
 */
export function suggestSurvivor(
  group: CandidateGroup,
  contractCounts: Map<number, number>,
): VendorRow {
  let best = group.vendors[0];
  for (const vendor of group.vendors) {
    const count = contractCounts.get(vendor.id) ?? 0;
    const bestCount = contractCounts.get(best.id) ?? 0;
    if (count > bestCount || (count === bestCount && vendor.id < best.id)) {
      best = vendor;
    }
  }
  return best;
}
