/**
 * Times the data pipeline behind the dashboard, budget overview and contracts
 * list against a local org, stage by stage, counting the Supabase REST calls
 * each stage issues. This is the before/after instrument for
 * docs/spend-pipeline-perf-progress.md.
 *
 * Usage (from the repo root, against the local Supabase + Redis in .env.local):
 *   ORG_ID=<org uuid> USER_ID=<a user in that org> \
 *   npx tsx --tsconfig scripts/spend-pipeline-timing.tsconfig.json \
 *     scripts/spend-pipeline-timing.ts 2>results.txt >logs.jsonl
 *
 * USER_ROLE defaults to 12 (client supervisor). The org's base currency and
 * fiscal year start are read from the database. Results go to stderr, pino
 * logs to stdout, so redirect them separately.
 *
 * The tsconfig aliases `server-only` to a stub so the real modules import.
 * React's cache() is a no-op here (no dispatcher), which matches a standalone
 * HTTP request exactly; a server render dedupes one FX read on top of that.
 * The run writes nothing to Postgres. It does write to the local Redis the
 * app itself writes: derived-segment entries and the FX series mirror.
 */
import dotenv from 'dotenv';
import type { UserMetadata } from '@/constants/types';
import type { BaseCurrency } from '@/lib/base-currency';

dotenv.config({ path: '.env.local' });

const out = (line: string) => process.stderr.write(`${line}\n`);

let calls: Record<string, number> = {};
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  let key = url;
  try {
    key = new URL(url).pathname
      .replace(/^\/rest\/v1\//, '')
      .replace(/^\/rpc\//, 'rpc:');
  } catch {
    // Not a URL; count it under the raw string.
  }
  calls[key] = (calls[key] ?? 0) + 1;
  return realFetch(input, init);
}) as typeof fetch;

const callsSummary = () => {
  const total = Object.values(calls).reduce((sum, n) => sum + n, 0);
  const detail = Object.entries(calls)
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => `${key}×${n}`)
    .join(', ');
  return `${total} REST calls${total ? ` [${detail}]` : ''}`;
};

async function timed<T>(label: string, fn: () => Promise<T> | T): Promise<T> {
  calls = {};
  const start = performance.now();
  const result = await fn();
  const ms = Math.round(performance.now() - start);
  out(`${label.padEnd(58)} ${String(ms).padStart(6)} ms   ${callsSummary()}`);
  return result;
}

const kb = (value: unknown) =>
  `${(Buffer.byteLength(JSON.stringify(value)) / 1024).toFixed(0)} KB`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    out(`Missing ${name}. See the usage comment at the top of this script.`);
    process.exit(1);
  }
  return value;
}

interface RawContract {
  currency?: string | null;
  term_start_date?: Array<{ date: string }> | null;
}

async function main() {
  const organizationId = requireEnv('ORG_ID');
  const userId = requireEnv('USER_ID');
  const userRole = Number(process.env.USER_ROLE ?? 12);

  const { runWithMcpContext } = await import('@/app/lib/mcp/context');
  const { ChatToolCache } = await import('@/lib/v2/chat/tools/cache');
  const { getOrgBaseCurrency } = await import('@/lib/base-currency-server');
  const { createClient } = await import('@/utils/supabase/service_server');

  const { data: org } = await createClient()
    .from('organizations')
    .select('name, fiscal_year_start_month')
    .eq('id', organizationId)
    .single();
  if (!org) {
    out(
      `No organization ${organizationId} in the database this env points at.`,
    );
    process.exit(1);
  }
  const baseCurrency: BaseCurrency = await getOrgBaseCurrency(organizationId);
  const fiscalYearStart = org.fiscal_year_start_month || 1;

  const userMetadata: UserMetadata = {
    userId,
    userProfile: null,
    userRole,
    organizationId,
    organizationName: org.name ?? undefined,
    organizationFY: fiscalYearStart,
    dateFormat: 'yyyy-MM-dd',
    organizationDateFormat: 'yyyy-MM-dd',
    baseCurrency,
    appModules: [],
    isTrial: false,
    cpmTrialEnabled: false,
    investorTrialEnabled: false,
    cpmMcpEnabled: false,
    investorMcpEnabled: false,
    cpmInvoicesEnabled: true,
    cpmExchangeAgreementsEnabled: false,
    portcoKpisEnabled: false,
  };
  out(
    `org=${org.name} base=${baseCurrency} fyStart=${fiscalYearStart} role=${userRole}`,
  );

  await runWithMcpContext(
    {
      userMetadata,
      scopes: ['read'],
      tokenId: 'spend-pipeline-timing',
      tokenSource: 'pat',
      cache: new ChatToolCache(),
    },
    async () => {
      const actions = await import('@/app/lib/contracts/actions');
      const superuser = await import('@/data/superuser/contracts');
      const service = await import('@/lib/v2/contracts/service');
      const spend = await import('@/lib/v2/spend');
      const spendRates = await import('@/lib/v2/core/spendRates');
      const fxRates = await import('@/lib/v2/core/fxRates');
      const baseRates = await import('@/lib/v2/core/baseRates');
      const pricing = await import('@/lib/v2/core/pricing');
      const lineage = await import('@/lib/v2/core/lineage');
      const filters = await import('@/lib/v2/core/filters');
      const cutoffs =
        await import('@/lib/contracts/resolveRemovedProductsForContracts');
      const chain = await import('@/lib/contracts/productLineageResolution');
      const productTransforms = await import('@/lib/v2/products/transforms');
      const query = await import('@/app/api/v2/handlers/spend/query');
      const population = await import('@/lib/v2/bloomberg-sid/population');
      const vendors = await import('@/lib/v2/vendors/service');
      const contractTransforms = await import('@/lib/v2/contracts/transforms');
      const { costMethodInput, spendInputsOnMount } =
        await import('@/components/budget/costMethod');
      const { prefetchSpendQueries } =
        await import('@/components/budget/SpendQueryHydration');

      const asOf = new Date();
      const fiscal = { startMonth: fiscalYearStart };
      const today = asOf.toISOString().slice(0, 10);
      const current = spend.resolveWindow('currentFY', asOf, fiscal);
      const next = spend.resolveWindow('nextFY', asOf, fiscal);
      const isoDay = (date: Date) => date.toISOString().slice(0, 10);

      out('\n=== A. contract set fetch (Redis warm) ===');
      const base = await timed(
        'fetchContractsBase() [Redis hit + ACL rpc]',
        () => actions.fetchContractsBase(),
      );
      out(`   rows=${base.length}  json=${kb(base)}`);

      out('\n=== B. contract set cache-MISS path, read-only pieces ===');
      // The superuser fetch types its rows for the adaptation layer; only the
      // two columns the rate prefetch reads are named here.
      const raw = (await timed('fetchContractsByUserRoles({orgWide})', () =>
        superuser.fetchContractsByUserRoles({ userMetadata, orgWide: true }),
      )) as unknown as RawContract[];
      out(`   rows=${raw.length}  json=${kb(raw)}`);
      const entries = raw.map((contract) => ({
        currency: contract.currency,
        startDate: productTransforms.getContractStartDate({
          term_start_date: contract.term_start_date,
        }),
      }));
      const missRates = await timed(
        'buildBaseCurrencyRates(all contracts)',
        () => baseRates.buildBaseCurrencyRates(entries, baseCurrency),
      );
      await timed('convertAllProductsToUSD × N (prefetched rates)', () =>
        Promise.all(
          raw.map((contract) =>
            productTransforms.convertAllProductsToUSD(
              contract,
              baseCurrency,
              missRates,
            ),
          ),
        ),
      );

      out('\n=== C. getEnrichedContracts stages, one by one ===');
      const relationships = await timed('fetchAllRelationshipsForOrg', () =>
        superuser.fetchAllRelationshipsForOrg(organizationId),
      );
      out(`   edges=${relationships.length}`);
      const cutoffsByContract = await timed('resolveProductFeeCutoffs', () =>
        cutoffs.resolveProductFeeCutoffs({
          organizationId,
          chainContracts: chain.contractsToChainContracts(base),
          relationships,
        }),
      );
      const filtered = filters.filterActiveContracts(
        filters.filterExcludeAIFailed(base),
      );
      out(`   active non-failed rows=${filtered.length}`);
      const withLineage = await timed('enrichWithLineage (CPU)', () =>
        lineage.enrichWithLineage(filtered, relationships),
      );
      const pricingEntries = withLineage.map((ec) => ({
        currency: ec.contract.currency,
        startDate: productTransforms.getContractStartDate(ec.contract),
      }));
      await timed('  ↳ buildBaseCurrencyRates alone (the FX read)', () =>
        baseRates.buildBaseCurrencyRates(pricingEntries, baseCurrency),
      );
      const withPricing = await timed(
        'enrichWithPricing (FX read + generatePriceHistory×N)',
        () =>
          pricing.enrichWithPricing(withLineage, fiscalYearStart, {
            cutoffsByContract,
            baseCurrency,
          }),
      );
      const enriched = await timed('enrichWithEffectiveFees (CPU)', () =>
        pricing.enrichWithEffectiveFees(withPricing),
      );
      out(
        `   enriched json=${kb(enriched)}  priceHistory-only json=${kb(
          enriched.map((ec) => ec.priceHistory),
        )}`,
      );

      out('\n=== D. FX reads: what buildSpendRateProvider asks for ===');
      const contractsIn = enriched.map((ec) => ec.contract);
      const earliestTerm = contractsIn
        .map((contract) => spend.earliestIsoDate(contract.term_start_date))
        .filter((date): date is string => date !== null)
        .sort()[0];
      const quotes = [
        ...new Set(
          contractsIn.map(
            (contract) =>
              (contract.currency ?? '').trim().toUpperCase() || 'USD',
          ),
        ),
      ];
      out(
        `   quotes=${quotes.join(',')} target=${baseCurrency} earliestTermStart=${earliestTerm} span=${isoDay(current.start)}..${isoDay(next.end)}`,
      );
      const codes = [...quotes, baseCurrency];
      const dailyTerm = await timed(
        `getDailyUsdRates(term-starts: ${earliestTerm}..today)`,
        () => fxRates.getDailyUsdRates(codes, earliestTerm ?? today, today),
      );
      out(
        `   rows: ${[...dailyTerm].map(([quote, rates]) => `${quote}=${rates.size}`).join(' ')}`,
      );
      await timed('getDailyUsdRates(span: currentFY..nextFY)', () =>
        fxRates.getDailyUsdRates(
          codes,
          isoDay(current.start),
          isoDay(next.end),
        ),
      );
      const providerTerm = await timed(
        'buildSpendRateProvider (default term-starts)',
        () =>
          spendRates.buildSpendRateProvider({
            contracts: contractsIn,
            target: baseCurrency,
            asOf,
            span: { start: current.start, end: next.end },
          }),
      );
      await timed('buildSpendRateProvider (dailyRange: span)', () =>
        spendRates.buildSpendRateProvider({
          contracts: contractsIn,
          target: baseCurrency,
          asOf,
          span: { start: current.start, end: next.end },
          dailyRange: 'span',
        }),
      );

      out('\n=== E. engine stamp pass (getContractsList tail) ===');
      const currency = {
        mode: 'base' as const,
        target: baseCurrency,
        rates: providerTerm,
      };
      await timed(
        'enrichWithEngineSpend (4 commitments + invoice all-time, CPU)',
        () =>
          spend.enrichWithEngineSpend(
            enriched,
            relationships,
            fiscalYearStart,
            asOf,
            { currency, eventCutoffs: cutoffsByContract },
          ),
      );
      await timed(
        'enrichWithEngineSpend + productValues + cycleDates (budget historical)',
        () =>
          spend.enrichWithEngineSpend(
            enriched,
            relationships,
            fiscalYearStart,
            asOf,
            {
              currency,
              eventCutoffs: cutoffsByContract,
              productValues: true,
              cycleDates: true,
            },
          ),
      );

      out(
        '\n=== F. whole-page entry points (React cache is a no-op here = separate HTTP requests) ===',
      );
      const list = await timed(
        'getContractsList()  [= /contracts, dashboard, budget base]',
        () => service.getContractsList(),
      );
      out(`   contracts=${list.contracts.length}`);
      const visible = filters.filterExcludeInvoices(list.contracts);
      const rows = contractTransforms.buildContractTableRows(visible, {
        groupByVendor: true,
        nestByLineage: true,
        relationships: list.relationships,
      });
      out(
        `   /contracts table payload: rows=${rows.length} json=${kb(rows)}  (relationships json=${kb(list.relationships)})`,
      );

      out('\n=== G. Bloomberg SID population ===');
      const sid = await timed('loadSidSpendPopulation(currentFY..nextFY)', () =>
        population.loadSidSpendPopulation(organizationId, {
          window: { start: current.start, end: next.end },
        }),
      );
      out(
        `   seats=${sid.seats.length} accounts=${sid.contracts.length} vendorIds=${[...sid.vendorIds].join(',')}`,
      );
      await timed('loadSidSpendPopulation(+matchEmployees)', () =>
        population.loadSidSpendPopulation(organizationId, {
          window: { start: current.start, end: next.end },
          matchEmployees: true,
        }),
      );

      out(
        '\n=== H. runSpendQuery = one /api/v2/spend request each (dashboard fires 3 in parallel) ===',
      );
      await timed('amortized currentFY year total  (card)', () =>
        query.runSpendQuery(
          userMetadata,
          costMethodInput('amortized', 'currentFY', 'year', 'total'),
          { bloombergSid: true },
        ),
      );
      await timed('amortized nextFY year total     (card)', () =>
        query.runSpendQuery(
          userMetadata,
          costMethodInput('amortized', 'nextFY', 'year', 'total'),
          { bloombergSid: true },
        ),
      );
      const chart = await timed(
        'amortized currentFY month by contract (chart)',
        () =>
          query.runSpendQuery(
            userMetadata,
            costMethodInput('amortized', 'currentFY', 'month', 'contract'),
            { bloombergSid: true },
          ),
      );
      out(
        `   chart items=${chart.items.length} refs=${Object.keys(chart.refs).length} json=${kb(chart)}`,
      );
      await timed(
        'committed currentFY year total  (Contract Term; no seats)',
        () =>
          query.runSpendQuery(
            userMetadata,
            costMethodInput('committed', 'currentFY', 'year', 'total'),
            { bloombergSid: false },
          ),
      );
      await timed(
        'amortized currentFY year total  AGAIN (derivation cache warm)',
        () =>
          query.runSpendQuery(
            userMetadata,
            costMethodInput('amortized', 'currentFY', 'year', 'total'),
            { bloombergSid: true },
          ),
      );

      // A server render shares one enrichment across the three through React
      // cache(); here each query enriches again, so subtract two contract
      // fetches (6 calls) to read this as a render.
      await timed(
        'prefetchSpendQueries(amortized) [dashboard/budget render: 3 queries, 1 population]',
        () =>
          prefetchSpendQueries(
            userMetadata,
            spendInputsOnMount('amortized', current.fyNum, current.fyNum),
          ),
      );

      out(
        '\n=== I. server-side seat totals used by TopVendors + budget table ===',
      );
      await timed('getSidVendorTotals() [population + 2× runSpendQuery]', () =>
        vendors.getSidVendorTotals(),
      );

      out('\n=== J. budget historical FY path ===');
      await timed(
        `getBudgetContracts(${current.fyNum - 1}) [active+archived re-enrich + stamps]`,
        () => service.getBudgetContracts(current.fyNum - 1),
      );
      await timed('getOldestContractFiscalYear()', () =>
        service.getOldestContractFiscalYear(),
      );
    },
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    out(
      `FAILED: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
    process.exit(1);
  });
