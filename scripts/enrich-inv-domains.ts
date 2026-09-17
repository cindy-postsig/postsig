/**
 * Backfill domain (and description) for `inv_companies` rows that have a name but
 * no domain, scoped to companies referenced by 4 specific orgs' inv_company rows.
 *
 * Two phases — find/resolve is read-only; writing is separate and explicit:
 *
 *   Phase 1 (default): find scoped domain-less companies, resolve a candidate
 *   domain via the SAME providers the app uses (Brandfetch + Logo.dev name
 *   search), and write a review CSV. NO DB writes.
 *     npx tsx scripts/enrich-inv-domains.ts
 *
 *   Phase 2: after you review/edit the CSV (blank the domain on any row you don't
 *   trust, delete rows entirely, etc.), apply it. For each approved domain we also
 *   fetch a description from the Companies API and write domain + description.
 *     npx tsx scripts/enrich-inv-domains.ts --apply scripts/out/inv-domain-candidates.csv          # dry run
 *     npx tsx scripts/enrich-inv-domains.ts --apply scripts/out/inv-domain-candidates.csv --commit # write
 *
 * Prod DB comes from .env.prod (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
 * loaded into an isolated object so it can't be confused with .env.local's dev creds.
 * External-API keys (Brandfetch/Logo.dev/Companies) come from .env.local.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
const prodEnv: Record<string, string> = {};
config({ path: '.env.prod', processEnv: prodEnv });

const ORG_IDS = [
  '2896b100-72b0-4a93-92bf-f49574086cad',
  '75768263-d6af-405d-9595-09e02657a933',
  '9997bf83-bfee-416f-bd7a-4e5e948aed3d',
  'f84038b0-7770-4e52-b640-32a99d40adf3',
];

const OUT_DIR = 'scripts/out';
const OUT_CSV = `${OUT_DIR}/inv-domain-candidates.csv`;
const CONCURRENCY = 5;

function prodClient(): SupabaseClient {
  const url = prodEnv.NEXT_PUBLIC_SUPABASE_URL;
  const key = prodEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      '.env.prod missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  console.log(`✓ Prod DB: ${url}`);
  return createClient(url, key, { auth: { persistSession: false } });
}

function cleanName(name: string): string {
  return name
    .replace(/[.,"]/g, '')
    .replace(/(ltd|llc|inc|international sl)/gi, '')
    .replace(/\(.*?\)/g, '')
    .trim();
}

interface Candidate {
  domain: string;
  matchedName: string | null;
  source: 'brandfetch' | 'logodev';
  exact: boolean;
}

async function getJson(url: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(url, {
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function resolveCandidates(name: string): Promise<Candidate[]> {
  const cleaned = cleanName(name);
  const lc = cleaned.toLowerCase();
  const out: Candidate[] = [];

  const clientId = process.env.BRANDFETCH_CLIENT_ID;
  if (clientId) {
    const data = await getJson(
      `https://api.brandfetch.io/v2/search/${encodeURIComponent(cleaned)}?c=${clientId}`,
    );
    if (Array.isArray(data)) {
      for (const r of data.slice(0, 5)) {
        if (!r?.domain) continue;
        out.push({
          domain: String(r.domain).toLowerCase(),
          matchedName: r.name ?? null,
          source: 'brandfetch',
          exact: (r.name ?? '').toLowerCase() === lc,
        });
      }
    }
  }

  const secret = process.env.LOGO_DEV_SECRET_KEY;
  if (secret) {
    const data = await getJson(
      `https://api.logo.dev/search?q=${encodeURIComponent(cleaned)}&strategy=match`,
      { Authorization: `Bearer ${secret}` },
    );
    if (Array.isArray(data)) {
      for (const r of data.slice(0, 5)) {
        if (!r?.domain) continue;
        out.push({
          domain: String(r.domain).toLowerCase(),
          matchedName: r.name ?? null,
          source: 'logodev',
          exact: (r.name ?? '').toLowerCase() === lc,
        });
      }
    }
  }

  return out;
}

function pickBest(cands: Candidate[]): {
  domain: string | null;
  source: string;
  confidence: 'exact' | 'agreed' | 'single' | 'fuzzy' | 'none';
} {
  if (cands.length === 0)
    return { domain: null, source: '', confidence: 'none' };

  const byDomain = new Map<string, Candidate[]>();
  for (const c of cands)
    byDomain.set(c.domain, [...(byDomain.get(c.domain) ?? []), c]);

  const exact = cands.find((c) => c.exact);
  if (exact)
    return { domain: exact.domain, source: exact.source, confidence: 'exact' };

  const agreed = [...byDomain.entries()].find(
    ([, list]) => new Set(list.map((c) => c.source)).size > 1,
  );
  if (agreed)
    return {
      domain: agreed[0],
      source: 'brandfetch+logodev',
      confidence: 'agreed',
    };

  if (byDomain.size === 1)
    return {
      domain: cands[0].domain,
      source: cands[0].source,
      confidence: 'single',
    };

  return {
    domain: cands[0].domain,
    source: cands[0].source,
    confidence: 'fuzzy',
  };
}

async function fetchProfile(
  domain: string,
): Promise<{ name: string | null; description: string | null } | null> {
  const key = process.env.COMPANIES_API_KEY;
  if (!key) return null;
  const data = await getJson(
    `https://api.thecompaniesapi.com/v2/companies/${encodeURIComponent(domain)}`,
    { Authorization: `Basic ${key}` },
  );
  if (!data) return null;
  return {
    name: data?.about?.name ?? null,
    description:
      data?.descriptions?.knowledgeGraph ?? data?.descriptions?.primary ?? null,
  };
}

// Generic corporate words that match across unrelated companies — ignore them
// so "Enclave535 Holdings" doesn't "verify" against "Booking Holdings".
const STOP = new Set([
  'holdings',
  'holding',
  'security',
  'technologies',
  'technology',
  'software',
  'labs',
  'group',
  'systems',
  'solutions',
  'ventures',
  'capital',
  'global',
  'international',
  'services',
  'company',
  'corporation',
  'industries',
  'health',
  'aviation',
  'analytics',
  'digital',
  'platform',
  'native',
]);

// Token-overlap check: do our name and the Companies API canonical name share a
// significant (>=4 char) non-generic word? Catches name-collision false positives.
function namesMatch(ours: string, theirs: string | null): boolean {
  if (!theirs) return false;
  const tokens = (s: string) =>
    new Set(
      cleanName(s)
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !STOP.has(w)),
    );
  const a = tokens(ours);
  const b = tokens(theirs);
  for (const w of a) if (b.has(w)) return true;
  // also accept short names fully contained (e.g. "Voze" vs "Voze")
  const ja = cleanName(ours)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const jb = cleanName(theirs)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return ja.length >= 3 && (jb.includes(ja) || ja.includes(jb));
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

async function findScopedDomainless(db: SupabaseClient) {
  const { data: links, error: linkErr } = await db
    .from('inv_company')
    .select('company_id')
    .in('organization_id', ORG_IDS);
  if (linkErr) throw new Error(`inv_company: ${linkErr.message}`);

  const globalIds = [
    ...new Set((links ?? []).map((r) => r.company_id as number)),
  ];
  if (globalIds.length === 0) return [];

  const rows: { id: number; name: string }[] = [];
  for (let i = 0; i < globalIds.length; i += 500) {
    const chunk = globalIds.slice(i, i + 500);
    const { data, error } = await db
      .from('inv_companies')
      .select('id, name, domain')
      .in('id', chunk)
      .is('domain', null);
    if (error) throw new Error(`inv_companies: ${error.message}`);
    for (const r of data ?? [])
      rows.push({ id: r.id as number, name: r.name as string });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
}

async function phaseResolve() {
  const db = prodClient();
  console.log('Finding domain-less inv_companies scoped to the 4 orgs...');
  const companies = await findScopedDomainless(db);
  console.log(`Found ${companies.length} domain-less companies in scope.\n`);

  const results = await mapPool(companies, CONCURRENCY, async (c) => {
    const cands = await resolveCandidates(c.name);
    const best = pickBest(cands);
    const profile = best.domain ? await fetchProfile(best.domain) : null;
    const verified = namesMatch(c.name, profile?.name ?? null);
    return {
      ...c,
      ...best,
      candidates: cands,
      canonicalName: profile?.name ?? null,
      description: profile?.description ?? null,
      verified,
    };
  });

  const byConf = results.reduce<Record<string, number>>((acc, r) => {
    const k = r.domain
      ? r.verified
        ? `${r.confidence}+verified`
        : `${r.confidence}+UNVERIFIED`
      : 'none';
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log('Breakdown:', byConf, '\n');

  for (const r of results) {
    const flag = !r.domain ? '∅' : r.verified ? '✓' : '⚠';
    console.log(
      `  ${flag} [${r.confidence.padEnd(6)}] ${r.name.slice(0, 34).padEnd(34)} → ${(r.domain ?? '— none —').padEnd(28)} ${
        r.verified
          ? `(Companies API: ${r.canonicalName})`
          : r.canonicalName
            ? `(≠ ${r.canonicalName})`
            : ''
      }`,
    );
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const header =
    'id,name,domain,confidence,verified,companies_api_name,description,all_candidates';
  const lines = results.map((r) =>
    [
      r.id,
      r.name,
      r.domain ?? '',
      r.confidence,
      r.verified ? 'yes' : 'no',
      r.canonicalName ?? '',
      r.description ?? '',
      r.candidates
        .map((c) => `${c.domain}(${c.source}${c.exact ? ',exact' : ''})`)
        .join(' '),
    ]
      .map(csvCell)
      .join(','),
  );
  writeFileSync(OUT_CSV, [header, ...lines].join('\n'));
  const verifiedCount = results.filter((r) => r.verified).length;
  console.log(
    `\nWrote ${results.length} rows → ${OUT_CSV}  (${verifiedCount} cross-verified by Companies API)\n` +
      `'⚠' = name-search found a domain but Companies API's canonical name doesn't match → review these.\n` +
      `Review/edit the CSV (blank the domain on any row you don't trust), then:\n` +
      `  npx tsx scripts/enrich-inv-domains.ts --apply ${OUT_CSV}            # dry run\n` +
      `  npx tsx scripts/enrich-inv-domains.ts --apply ${OUT_CSV} --commit   # write`,
  );
}

async function phaseApply(csvPath: string) {
  const db = prodClient();
  const table = parseCsv(readFileSync(csvPath, 'utf8'));
  const header = table[0];
  const idI = header.indexOf('id');
  const nameI = header.indexOf('name');
  const domI = header.indexOf('domain');
  const approved = table
    .slice(1)
    .map((r) => ({
      id: Number(r[idI]),
      name: r[nameI],
      domain: (r[domI] ?? '').trim().toLowerCase(),
    }))
    .filter((r) => r.id && r.domain);

  const commit = process.argv.includes('--commit');
  console.log(
    `${commit ? 'APPLYING' : 'DRY RUN'}: ${approved.length} approved domains from ${csvPath}` +
      ` (fetching descriptions, then writing domain + description)\n`,
  );

  let ok = 0;
  for (const r of approved) {
    const profile = await fetchProfile(r.domain);
    const description = profile?.description ?? null;
    const patch: { domain: string; description?: string } = {
      domain: r.domain,
    };
    if (description) patch.description = description;

    if (!commit) {
      console.log(
        `  ${r.id}  ${r.name} → ${r.domain}${description ? `  [+desc ${description.length}c]` : '  [no desc]'}`,
      );
      continue;
    }
    const { error } = await db
      .from('inv_companies')
      .update(patch)
      .eq('id', r.id)
      .is('domain', null);
    if (error) console.error(`  ✗ ${r.id} ${r.name}: ${error.message}`);
    else {
      ok++;
      console.log(
        `  ✓ ${r.id} ${r.name} → ${r.domain}${description ? ' (+desc)' : ''}`,
      );
    }
  }
  if (commit) console.log(`\nDone. Updated ${ok}/${approved.length} rows.`);
  else console.log(`\nDRY RUN — no writes. Re-run with --commit to apply.`);
}

async function main() {
  const applyIdx = process.argv.indexOf('--apply');
  if (applyIdx !== -1) await phaseApply(process.argv[applyIdx + 1] ?? OUT_CSV);
  else await phaseResolve();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
