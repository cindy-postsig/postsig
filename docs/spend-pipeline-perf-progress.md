# Spend Pipeline Performance — Progress & Handoff

Resume-from-here state for the work that started from the 2026-09-09 audit of
what the dashboard, the budget overview and the contracts list pull on every
view. Last updated 2026-09-09. Branch `fix/spend-pipeline-round-trips`, cut
from `development` at `4dd95a2a1` (the `timed()` debug-timing commit, #2275).

## Current state — read this first

- Seven commits on the branch, each gated on lint + prettier + tsc + the
  full jest suite. Open as PR #2278 (2026-09-09). Numbers below are from the local
  Berenberg clone (360 contracts, EUR base, 370 Bloomberg seats).
  - `45db07db1` perf(spend): key the enriched-contract cache identically
    across callers (step 1).
  - `e10ee73e0` perf(fx): keep each quote's daily-rate series in memory and
    Redis (step 2).
  - `8b72bbe64` perf(db): the migration
    `20260909160000_contract_fetch_embed_indexes.sql` (step 0, see below).
  - `99892231b` docs(perf): this file plus the harness under `scripts/`.
  - `e8e87019c` perf(dashboard): stream the My Contracts card (step 3).
  - `40aac71d6` perf(spend): hydrate the spend surfaces from the render;
    seat totals seats-only (step 4).
  - `593e40247` perf(bloomberg): seat sources in Redis; fee lines through
    their fee (step 5).
- Steps 6 and 7 are open, each its own PR, in the order listed under
  **Remaining**.
- The measurement instrument is `scripts/spend-pipeline-timing.ts`. Run it
  before and after every step; the counts are the evidence, the milliseconds
  are local-only. Its output files are not gitignored, so write them outside
  the repo.

## The diagnosis in one paragraph

The spend engine's math is fine. A page view runs the full contract-enrichment
pipeline several times: once for the server render, once more on SID orgs
because `runSpendQuery` used to miss the React cache the render had filled,
and three more times as client `POST /api/v2/spend` calls for the cards and
the chart, each a standalone request of roughly thirteen sequential network
hops. Inside every one of those runs the FX store was paged in full back to
the org's earliest term start (28 REST calls, a count query per page, ~27k
rows for Berenberg), and the Bloomberg seat population was rebuilt from four
tables. On the database side, two tables on the contract-fetch path had no
index on `contract_id`, so PostgREST's per-row embeds scanned them whole:
`vendor_products_details` 935k sequential scans (6.1 billion tuples) and
`contract_docs` 1.16 million (3.7 billion tuples) on production.

## Measured on the local clone (REST calls, then ms)

| Stage                                             | before   | after steps 1–2 | after steps 3–5 |
| ------------------------------------------------- | -------- | --------------- | --------------- |
| getContractsList (contracts page, dashboard body) | 59 / 209 | 3 / 113         | 3 / 123         |
| runSpendQuery amortized currentFY total (a card)  | 48 / 200 | 19 / 157        | 5 / 138         |
| runSpendQuery committed currentFY (Contract Term) | 39 / 128 | 3 / 71          | 3 / 69          |
| getSidVendorTotals (Top Vendors, budget table)    | 98 / 352 | 23 / 218        | 2 / 93          |
| loadSidSpendPopulation (currentFY..nextFY)        | —        | 16 / 65         | 2 / 18          |
| prefetchSpendQueries (a render's three queries)   | —        | 25 / 309        | 11 / 310        |

The last column is a warm seat-sources cache; a miss adds the four table
reads (fee lines paged by 1,000) once per import. The prefetch stage counts
each query's contract fetch separately because React `cache()` is a no-op in
the harness; a render shares it, so 5 in the app, against the 49 calls the
three client requests it replaces issued (19 + 11 + 19). What is left on the
amortized path is the contract set's three ACL/relationship hops and the two
seat-population hops (accounts, months).
Each local REST call is 2–3 ms; on Vercel to Supabase it is 20–40 ms plus
PostgREST time, so the hop structure transfers and the milliseconds do not.

## Measured on production builds, in the browser (2026-09-09)

Branch base (`4dd95a2a1`, development plus the `timed()` labels) against
the branch tip, each exported with `git archive` into an ignored directory
under the repo (`.worktrees/perf-*`, `node_modules` and `.env.local`
symlinked; Turbopack refuses a `node_modules` symlink that points outside
the project root, so the scratchpad will not do), built with `next build`,
started with `LOG_LEVEL=debug next start` on 4546 and 4547, and loaded in a
Chrome session already signed in on `localhost` (cookies are not isolated by
port). Five loads of the dashboard and the budget overview per server;
medians below. Timers come from each server's log, page numbers from the
browser's navigation timing.

Time until the spend cards and chart have data, ms from navigation start:

| Page            | base  | branch |
| --------------- | ----- | ------ |
| Dashboard       | 1,387 | 731    |
| Budget overview | 1,265 | 571    |

On the base each view fired three `POST /api/v2/spend` calls after mount and
the cards filled when the slowest returned; on the branch the numbers arrive
in the HTML and the browser recorded no spend request on any load.

The `timed()` labels, median ms per occurrence:

| Label                                             | base       | branch    |
| ------------------------------------------------- | ---------- | --------- |
| spend.query (each client call)                    | 687 to 882 | none      |
| spend.prefetch (each render-time query)           | none       | 88 to 195 |
| spend.getEnrichedContracts inside the spend route | 402        | 0         |
| spend.buildSpendRateProvider                      | 65         | 14        |
| spend.loadSidSpendPopulation                      | 74         | 24        |
| spend.engine                                      | 60         | 61        |
| dashboard.getContractsList                        | 209        | 111       |

The engine is unchanged; what went away is around it. Each base spend call
re-enriched the org, paged the FX store and rebuilt the seat population; the
branch runs the three queries inside the render, shares one enrichment
through React `cache()`, and reads the seat population warm.

Two things to know:

- First byte moved later on the budget page (152 to 268 ms): the page is one
  render behind its loading state, so the prefetch sits inside it. Load event
  and dashboard first byte are within noise. That is the exchange: about
  100 ms later first byte for about 700 ms earlier numbers and three fewer
  requests per view.
- Dashboard first byte did not move with step 3, and `app/(app)/layout.tsx`
  is why: it awaits `getUserMetadata`, the `beta-sign` flag, the
  portfolio-hidden preference, `hasInvoicesAccess` and the assignments flag
  before anything streams. Those are step 6's identity hops; the shell cannot
  flush earlier until that PR lands.

## Done

### Step 0 — indexes for the contract-fetch embeds (migration, needs prod go)

`supabase/migrations/20260909160000_contract_fetch_embed_indexes.sql` creates,
with `IF NOT EXISTS`: `vendor_products_details (contract_id, sort_order NULLS
LAST)`, `contract_docs (contract_id)`, `contract_relationships
(child_contract_id)`, `activities (contract_id)`.

Why the first one is repeated: migration `20260422120000` created it, prod's
migration log says that migration ran, and the index is not on prod. Dev and
local have it. Prod also has a primary key on `vendor_products_details` that
dev and local lack, and none of the three has the natural-key unique index from
`20260624090000`. The table has been hand-altered on both cloud environments;
treat its migration history as untrustworthy and verify in `pg_indexes` after
deploying.

Verify on prod after deploy: `seq_scan` on those two tables in
`pg_stat_user_tables` should stop climbing, and the cache-miss contract fetch
(`fetchContractsBase called` → `Processed contracts from database` in the
logs, `processingTime`) should drop.

### Step 1 — one enrichment per request

`getEnrichedContracts` takes five positional primitives and React `cache()`
keys on the argument count as well as the values. `runSpendQuery`, the
assignments service, the budget export and the invoice validation summary
passed three or four, so a render that ran the list and the engine enriched
the org twice. All five arguments are now required, so the compiler enforces
the shape; `__tests__/v2/spend-query-handler.test.ts` pins the call.

### Step 2 — FX rate series kept per process and mirrored to Redis

`lib/v2/core/fxRates.ts`. Each process keeps a `QuoteSeries { rates, explored
}` per quote. `explored` is the list of disjoint stretches already asked
about, which reach wider than the dates with rates because the provider quotes
nothing on weekends and holidays; two reads that never touched leave the gap
between them unexplored, so a later read inside it still reaches the store. Reads inside it cost no round trip; only the days past it reach the
store, then the provider. The series is mirrored to Redis as
`fx:daily:v2:<QUOTE>` (gzipped pairs plus the explored spans, 7-day TTL, no org
prefix so `clearOrganizationCache` leaves it alone) and a cold instance loads
it in one `mget`. Concurrent fills for the same quotes and span share one
promise. The store read asks for a count on the first page only and orders by
`(rate_date, quote)` so paging over several quotes is deterministic. A failed
provider call leaves the stretch unexplored so the next read retries it once
the one-hour backoff lapses. `resetFxRateSeries()` exists for tests.

Verify on prod: the `spend.buildSpendRateProvider` timing label should sit
near zero after the first request on an instance, and `fx_rates_daily`
`seq_scan` should stop climbing.

### Step 3 — the dashboard streams

`MyContractsSection` in `components/dashboard/sections.tsx`, behind its own
`Suspense` in `app/(app)/(cpm)/dashboard/page.tsx`; the page awaits only
`getUser`, `getUserMetadata` and `hasInvoicesAccess` before the boundaries.
The jsdom tests that import `sections.tsx` stub `ContractsTable` the way they
stub the other client components, since its import chain reaches
`next/cache`.

### Step 4 — spend queries run in the render; seat totals run seats-only

`components/budget/SpendQueryHydration.tsx`: `prefetchSpendQueries` runs the
inputs `spendInputsOnMount` (in `costMethod.ts`) derives, which are exactly
the keys `useCostMethodTotals` and `SpendChart` build, and `SpendQueryHydration`
wraps the client surface in a `HydrationBoundary`. One seat population is
loaded across the union of the flow-basis windows and handed to those
queries; Contract Term stays contracts-only. A failure hydrates nothing and
logs at warn; the client fetches as before. `BudgetSection` and
`BudgetOverviewServer` use it; the budget page passes the selected `fy`, so
a historical year prefetches four queries.

`runSpendQuery` takes `scope.population: 'seats'`, which skips
`getEnrichedContracts` and runs the seat resolver alone; it needs
`bloombergSid` and throws otherwise. `getSidVendorTotals` passes it.

Verify on prod: `spend.prefetch` timing labels appear per render (with the
query's kind/window in context) and `spend.query` route calls from the
dashboard and budget overview stop at page load; they still fire on a method
change.

### Step 5 — seat sources cached in Redis; fee lines through the fees embed

`lib/v2/bloomberg-sid/queries.ts`. `fetchSidSeatSources` keeps its result
under `org:<id>:sid:sources:v1:<firmwideId>:<reportIds>` (gzipped, 24 h TTL).
The key names the reports it was built from: a new month changes the
selection, `--replace` re-inserts the report under a new id, and
`clearOrganizationCache`'s org sweep reaches it. The months read stays on
every request as the invalidation signal. On a miss, fee lines are selected
through `bloomberg_sid_exchange_fees!inner(report_id)` in one paged read;
`fetchSidReport` and `fetchLatestSidProducts` use the same loader, so the
fee-id chunking is gone.

Verify on prod: `Cache hit for Bloomberg SID seat sources` at debug after the
first request per instance and import; `spend.loadSidSpendPopulation` near
the cost of two reads.

## Remaining, in order

### Step 6 — trim the identity hops (cross-cutting, separate PR)

Every request pays the proxy gate (two Supabase calls) and then
`getUserMetadata` (`data/users.ts`): `auth.getUser` again, the users join, an
Edge Config read, then `org_preferences` twice and `user_preferences` once.
Fold the three preference reads into the users select (they need the service
client: `org_preferences` RLS hides rows from viewers, which is why
`getOrgBaseCurrency` already uses it), and consider passing the gate's
verified user id to the render on a request header the proxy strips from
incoming requests, so the second `auth.getUser` goes away. Security-sensitive;
review with the lead.

What the timer A/B added (2026-09-09): dashboard first byte did not move
with step 3 because `app/(app)/layout.tsx` awaits `getUserMetadata`, the
`beta-sign` flag, the portfolio-hidden preference, `hasInvoicesAccess` and
the assignments flag before anything streams. Those awaits belong to this
step: they are per-request identity and flag reads, and the shell cannot
flush until they resolve. Measure with the production-build recipe above and
expect first byte, not the timers, to be the number that moves.

Related database work for the same PR: 208 `auth_rls_initplan` advisor
warnings on prod (205 on dev). Policies call `auth.uid()` per row instead of
`(select auth.uid())`. The ones on the identity path are `user_preferences`,
`org_preferences`, `trusted_devices`, `user_module_access`,
`organization_modules`, `folders`, `folder_contracts`.

### Step 7 — slim the cached contract projection (largest, separate PR)

The org-wide Redis entry is 733 KB gzipped and parses to 5.9 MB of JSON per
request; 335 rows are cached and the pages use 121. The select in
`data/superuser/contracts.ts` embeds the parent contract with `*`, contract
users with their products, folder ACL groups, uploaders and fee-override
versions; the enriched set the pages work from is 7.3 MB, 1.6 MB of it legacy
price history that only feeds TCV and the current-fee column. A narrower
cached projection (or a second key for the published subset) is the right
long-term move. Do it last; the earlier steps make it measurable.

What the 335 rows are (counted 2026-09-09 on the local clone through the
same fetch the cache uses), so a row split cannot mistake them for archived:

| rows | lifecycle   | workflow    | extraction     |
| ---- | ----------- | ----------- | -------------- |
| 96   | active      | published   | ok             |
| 25   | unconfirmed | published   | ok             |
| 89   | active      | uploaded    | failed         |
| 37   | active      | uploaded    | ok             |
| 76   | active      | new         | ok             |
| 11   | active      | in progress | 9 ok, 2 failed |
| 1    | active      | published   | failed         |

The 121 the pages use are the two published rows with a good extraction.
No archived (`inactive`) row is ever in the cached set: `getEnrichedContracts`
fetches them separately and uncached whenever `includeArchived` is asked for
(price history page, historical budget year, invoice validation), so a
published-subset key leaves those readers untouched. Three callers do read
the non-published rows from this cache and must keep the full entry: the
upload page's documents list (`status: 'all'`), cost-allocation amounts and
its MCP tool, and the invoice validation summary. Prefer narrower columns on
the one entry over fewer rows; if a second key is added, it is an addition,
not a replacement. Any projection change must keep every
`vendor_products_details` column the resolver reads. The 1.6 MB of
`priceHistory` in the enriched set is not in this cache at all; it is
generated after the read, and only the legacy price-history retirement
(`docs/legacy-price-history-retirement-plan.md`) removes it.

### Also noted, not scheduled

- The budget page's historical FY path (`getBudgetContracts(fy)`) re-fetches
  active + archived straight from the database (54 REST calls locally), is not
  React-cached, and `fy` is a `shallow: false` URL param so every year change
  is a full RSC re-render.
- Any contract update runs `clearOrganizationCache` on `*org:<id>:*`, which
  also wipes every derived-segment entry, so the next viewer pays a cold
  derivation as well as the cache-miss fetch.
- Two engines still run per request: the legacy `generatePriceHistory` for
  TCV, current fee and current products, and six `queryCommitments` passes in
  `enrichWithEngineSpend` for current/projected. About 70 ms of CPU locally;
  architectural debt, not a spinner cause.
- 13 published Berenberg contracts have an empty currency and convert as USD
  into the EUR base. Product question.

## How to measure

Local, stage by stage:

```
ORG_ID=<org uuid> USER_ID=<user in that org> \
npx tsx --tsconfig scripts/spend-pipeline-timing.tsconfig.json \
  scripts/spend-pipeline-timing.ts 2>results.txt >logs.jsonl
```

It injects the user through the MCP `AsyncLocalStorage` context so
`getUserMetadata` needs no cookies, aliases `server-only` to a stub, and wraps
global `fetch` to count REST calls per stage. React's `cache()` is a no-op in
it, which matches a standalone HTTP request; subtract one FX read for a server
render, and two contract fetches for the prefetch stage. It writes to the
local Redis the app itself writes (derived segments, FX series, SID seat
sources) and nothing to Postgres.

Prod, per request: the `timed()` labels (`spend.query`, `spend.prefetch`,
`spend.prefetch.loadSidSpendPopulation`, `spend.getEnrichedContracts`,
`spend.loadSidSpendPopulation`, `spend.buildSpendRateProvider`,
`spend.createCachedSegmentResolver`, `spend.engine`,
`spend.flushSegmentCache`, and the `dashboard.*` / `contracts.*` page
labels) are emitted at `debug`; set `LOG_LEVEL=debug` to see
them outside local dev. Prod, per table: the Supabase performance advisors and
`pg_stat_user_tables` (`seq_scan`, `seq_tup_read`), both read-only.

## Rules of the road for this branch

- One commit per step, conventional message, no ticket refs in code.
- Full gate before each commit: `npm run lint && npm run prettier:check &&
npx tsc --noEmit && npm test`.
- Harness before and after each step; put the REST-call deltas in the commit
  body.
- Keep the `timed()` labels where they are; add labels for new call sites.
- Never write to a database from a session. Migrations go through the normal
  release flow; the local database is updated with `supabase migration up`.
