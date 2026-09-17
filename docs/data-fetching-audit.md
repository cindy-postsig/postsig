# Data-Fetching Audit — N+1 Queries & Navigation Performance

Audit of the CPM data-fetching path, written 2026-08-31 against branch
`psk-1687`.

**Scope:** `lib/v2`, `data/superuser`, `app/lib/contracts`, `app/lib/budget`,
and the `app/(app)/(cpm)` render paths. Includes the deprecation plan for
`app/lib/contracts/processing.ts`.

**Method:** every finding was verified by reading the code at the cited line.
Call-site counts come from repo-wide greps. The client-bundle claims (F13) were
checked against chunk contents in `.next/static`. **No latency was measured** —
nothing here claims a millisecond figure, and the relative-cost language is
inferred from the call graph, not from a profile.

## Execution status (2026-08-31)

Phases 0–4 are implemented in one working-tree change set (uncommitted), each
gated on `lint + tsc + prettier + full jest` (402 suites / 4,837 tests green).
Verification before execution corrected the audit in several places:

- **F6 was wrong as written.** 27 `getAllOrgUsers` sites, not 26 — and only 17
  were dead. The other 10 (incl. both `contract-lineage-strategies.ts` sites
  and `verify-upload`, listed here as dead) feed live `.in('user_id', …)`
  tenancy predicates; deleting them would have been a security regression. The
  17 dead ones and the `orgUserIds` parameter itself are gone.
- **Phase 2's layout count-queries were dropped.** All `fetchContractsBase`
  callers pass zero args, so a plain `cache()` wrap dedupes layout + page into
  one fetch — the count queries would have added round trips and had to
  re-implement the `contracts_visible_to` ACL to avoid a cross-tenant count.
- **F4 had 6 call sites, not 4** (add `fetchContractHierarchy` and the
  monthly-report service); `groupContractsByVendor` in processing.ts was
  already dead and simply deleted. The map rewrite builds nodes from the
  edge-endpoint union (`buildOrgHierarchyMap`) so filtered-out parents can't
  flip a child invoice into totals.
- **F12 is a staleness/memory bug, not a tenancy leak** (contract ids are a
  global sequence and the cached boolean is viewer-independent). Deleted.
- **F1's real staleness gate is the admin-app publish flip** (status 5→4),
  which never invalidates this app's Redis set — but the list views already
  live on that cache, so search now matches them instead of being fresher.
  A publish-time invalidation hook is a follow-up ticket, not a blocker.
- **Bonus finds now fixed:** multi-word DB search was broken (`split(/\\s+/)`
  matches a literal `\s`, so two-word queries produced invalid tsquery and
  returned nothing); `fetchFilteredContracts` and two more imports were dead;
  10 files imported all of lodash with zero uses (`app/lib/utils.ts` among
  them, in nearly every client bundle). F14's real count is 50 files, not 35.

Phases 5-7 followed on 2026-08-31 (same branch, second change set):

- **Phase 5**: `clearOrganizationCache`/`clearUserCache` moved to paged `SCAN`
  - `UNLINK`. The contract set re-keyed per org
    (`org:<id>:contracts:base:v3:cur:<ccy>`, gzipped, role/user dropped) with
    visibility resolved per request via `resolveVisibleContractIds` run in
    parallel with the Redis GET; the org-wide fetch finally carries an explicit
    `organization_id` predicate. Sharing no longer needs cache invalidation;
    per-user invalidation deleted (ACL-only sites removed, data sites now
    org-wide). History note: per-user keying predated per-user visibility by six
    weeks and an org-level key helper sat unused since day one.
- **Phase 6 (minimal, no RLS)**: `vendor_products_details_versions` embed
  narrowed to `version_id` behind a `changed_data->fees` embedded filter
  (validated against live PostgREST incl. an honored-filter proof);
  `hasFeeOverrides` accepts both shapes. Parent embed's nested product rows
  narrowed to the four fields readers declare; parent's own columns left wide
  (an unchecked cast into the spend resolver makes their surface unbounded).
- **Phase 7**: CSV export ported onto `getReportData` (runner gained
  `contractIds` applied before `pipeline.filter` with `allContracts` kept
  unnarrowed; `all-renewals` pipeline added — it previously threw). Restored
  two v2 regressions: invoice subrow `isSuperseded` strikethrough and the
  `willNotRenewNextYear` badge (now computed off the displayed-cycle end
  date). Then deleted: `processing.ts`, `reportTotals.ts`,
  `fetchReportContracts(ByUserRoles)`, `defaultSegmentFeeContext`,
  `invoice-exclusion.ts`, and the three dead walkers in `currencyUtils`
  (~2,100 lines). Export behavior now matches the on-screen reports
  (sub-threshold invoice rows drop; renewals re-apply their window).

Remaining follow-ups: admin-app publish-flip cache invalidation hook
(cross-repo ticket); F8 service-client/RLS question (explicitly deferred);
`vendor:list` still keyed per user; `scripts/exportActualCosts.ts` clone;
F14 named-lodash migration (50 files); pre-existing gaps flagged during the
work — `bulkRemoveUserFromContracts` deletes without an `organization_id`
predicate, and seeded parent contracts never carry version rows so their
`annual_increase` compounding is never suppressed.

## CURRENT STATE — read this first

Three things account for most of the slowness:

1. **The entire org contract set is fetched several times per render.**
   `fetchContractsBase()` is not wrapped in React `cache()`, so `/contracts`
   pays a full Redis `GET` + `JSON.parse` of the whole set at least twice
   (layout, then page).
2. **The contract hierarchy is walked one query at a time.**
   `findTopmostParent` (`data/superuser/contracts.ts:1717`) issues one query per
   level, called inside sequential `for` loops at four sites.
3. **Header search re-queries the database on every keystroke**, bypassing the
   Redis cache built for exactly this purpose.

The fixes mostly already exist in the repo. `lib/v2` batches FX correctly, the
MCP tools filter contracts in memory, `filtering.ts` already has an in-memory
query matcher, and `lib/inventory/hierarchyUtils.ts` already has a synchronous
hierarchy walk. The legacy path around `processing.ts` and `app/lib/budget` is
the outlier.

Nothing in phases 0–5 requires a migration.

---

## §1 The plan

Ordered by leverage per unit of risk. Each phase is independently shippable.

### Phase 0 — Delete the dead code

No findings attached; this is pure removal.

- Delete `app/lib/contracts/reportFiltering.ts`. `filterReportContracts` has
  **zero** external references.
- Delete `processContractsForMultipleReports` (`app/lib/contracts/actions.ts:532`).
  Zero external references.
- Remove the unused `convertToUSD` import (`app/lib/contracts/actions.ts:45`)
  and the unused `generateContractData` import
  (`data/superuser/contracts.ts:39`). Each appears exactly once in its file —
  the import line, never a call.

**Verify:** `npx tsc --noEmit && npm test`. There is no behavior to check; if it
compiles and tests pass, the code was genuinely unreachable.

### Phase 1 — Search stops touching the database (F1, F13)

Highest-visibility win, and it unblocks the `processing.ts` retirement.

- Add a server action that calls `getContractsList()` (already `cache()`d and
  warm on most renders), filters in memory, and returns rows already shaped by
  `buildContractTableRow`. Model it on `app/lib/mcp/tools/cpm/contracts.ts`,
  which does exactly this today.
- Extend the in-memory matcher at `app/lib/contracts/filtering.ts:113` to cover
  order number. Lift `normalizeOrderNumber` out of
  `app/lib/mcp/tools/cpm/contracts.ts:157` into
  `lib/v2/contracts/orderNumber.ts`, beside `sanitizeOrderNumber`.
- Point `app/ui/search.tsx` and `components/search/AiPromptSearch.tsx` at the
  new action. Delete their `generateContractData` calls and imports.

**Two tradeoffs to decide before building:**

1. You trade Postgres FTS stemming/ranking for substring matching. Acceptable
   for typeahead over an org's contract set, and it is what the MCP tools
   already do — but users may notice on partial-word queries.
2. Results come from a cached set, so a contract uploaded seconds ago may not
   appear until invalidation. `invalidateOrganizationData` already fires on
   contract writes (`actions.ts:108`, `:202`); **confirm it also covers the
   upload path** before shipping.

**Verify:** network tab shows no request per keystroke after the first. Grep a
fresh build — `generatePriceHistory` and `calculateDoraScore` should drop out of
the chunk carrying the header's own strings.

### Phase 2 — Stop refetching the same set within one render (F2, F3, F9, F15)

- Give `fetchContractsBase` a positional-primitive signature, then wrap it in
  `cache()`. The signature change is load-bearing: React `cache()` keys on
  argument identity, so an options object misses across callers. The comment on
  `getEnrichedContracts` (`lib/v2/contracts/service.ts:145`) already explains
  this.
- Wrap `fetchAllRelationshipsForOrg` in `cache()` and move it into the existing
  `Promise.all` in `getEnrichedContracts` — it only needs `organizationId`, so
  the serial await at `service.ts:188` is free to parallelize.
- Replace the contracts layout's full fetch with four
  `select('id', { count: 'exact', head: true })` queries in one `Promise.all`.
- Drop the redundant `{ status: 'active' }` at the five `getContractsList`
  object call sites — it matches the default, so it only costs a cache miss.

**Verify:** `fetchContractsBase` already logs `processingTime` and
`contractCount` on miss and an info line on hit
(`app/lib/contracts/actions.ts:268-288`). Count those log lines per navigation
before and after. Target is one, not two.

### Phase 3 — Kill the hierarchy N+1 (F4, F12)

- At each of the four call sites, build the map once with
  `buildContractHierarchyMap(contracts, relationships)`
  (`lib/inventory/hierarchyUtils.ts:74`) and call the synchronous
  `findTopmostParent(id, map)` (`:236`).
- Swap `processing.ts`'s `groupContractsByVendor` for the v2 one at
  `lib/v2/contracts/transforms.ts:575`, which already takes lineage edges
  instead of querying.
- Delete the async `findTopmostParent` (`data/superuser/contracts.ts:1717`) and
  the module-global `contractRelationshipCache`
  (`app/lib/contracts/utils.ts:104`).

**Edge case to respect:** `buildContractHierarchyMap` only builds edges between
_loaded_ contracts (`hierarchyUtils.ts:82`). Call sites that filter before
walking must pass the unfiltered set, the same way `getEnrichedContracts`
already feeds `resolveProductFeeCutoffs` from the unfiltered base.

**Verify:** `__tests__/contract-lineage/multi-parent-latent-fixes.test.ts`
already pins map determinism and non-hierarchy edge exclusion. Add a test
asserting the sync and async walks agree on a two-level invoice chain **before**
deleting the async one.

### Phase 4 — Remove dead round trips, batch the FX reads (F5, F6)

- Drop `orgUserIds` from `extendQueryByUserRoleACL` and
  `extendSupabaseQueryByUserRole` (`data/utils.ts:13`, `:57`), then delete the
  26 `getAllOrgUsers` calls that only fed it. Check each site — a few may use
  the result for something else.
- Hoist `buildBaseCurrencyRates` above the map at the five
  `convertAllProductsToUSD` call sites, mirroring `enrichWithPricing`
  (`lib/v2/core/pricing.ts:82`).
- Wrap `getLatestUsdRates` (`lib/v2/core/fxRates.ts:353`) in `cache()`.

**Verify:** typecheck catches the signature change everywhere. For FX, assert
that a set of contracts with N distinct start dates issues one
`fx_rates_daily` span read rather than N.

### Phase 5 — Fix the cache layer (F10, F11)

- Replace `KEYS` with `SCAN` + `UNLINK` in `clearOrganizationCache`
  (`app/lib/redis/service.ts:220`). Small, isolated, removes a cross-user stall
  on every contract write.
- Re-key the contract set per organization rather than per user, applying the
  visible-id filter on read. Compress the payload.

**Risk:** the re-keying moves the ACL filter from "baked into the cached value"
to "applied on read", so it must be applied on **every** read path, not only the
ones that look like list views. This is the one change in the plan with a real
correctness surface.

**Verify:** a test per role that a cached org set filtered on read returns
exactly the ids `contracts_visible_to` returns for that user.

### Phase 6 — Narrow the query; revisit ACL filtering (F7, F8)

- Replace the `vendor_products_details_versions (changed_data)` embed with a
  boolean — a generated column, or one narrow pass selecting distinct ids where
  `changed_data ? 'fees'`. Contained: only `hasFeeOverrides`
  (`lib/v2/products/transforms.ts:123`) reads it on this path.
- Narrow the `contract_relationships → parent:contracts` embed from `*` to the
  fields lineage actually reads.
- **Separate ticket:** the service-client/RLS question behind F8. A
  security-invoker view removes the id round trip and the giant `IN` list, but it
  changes the trust model for every `data/superuser` caller. Scope it properly
  rather than folding it into a perf pass.

**Verify:** compare serialized payload size for a fixed org before and after.
The existing `contractCount` log line gives the denominator.

### Phase 7 — Retire `processing.ts`

After phases 0 and 1, one consumer remains.

- Port `app/lib/actions/export-report.ts` onto `getReportData` — the same
  pipeline the on-screen reports already use
  (`app/(app)/(cpm)/reports/[type]/page.tsx:97`).
- Move the subrow builders, `processContractUsage`, `processContractRenewal` and
  `processContractNdaData` into the report pipelines under
  `lib/v2/reports/definitions`. These are the only exports with no v2 twin.
- Delete `processing.ts`, then assess what remains of `app/lib/budget` —
  `currencyUtils` loses its last caller once phase 3 lands.

**Verify:** golden-file the CSV export before porting; exported bytes should be
identical. `__tests__/csv-export/` already has order-number and invoice-header
coverage to build on.

---

## §2 Findings

15 findings: 6 critical, 6 high, 3 medium.

### Critical

**F1 — Search re-queries the database on every keystroke.**
Both header search boxes call
`fetchContracts({ query, contractStatus: 4, hideFailed: true })`
(`app/ui/search.tsx:98`, `components/search/AiPromptSearch.tsx:~114`). That
server action (`app/lib/contracts/actions.ts:223`) goes straight to
`fetchContractsByUserRoles` — the full 16-embed query with `textSearch` — then
`processContractHierarchies`, then per-contract FX conversion. It never touches
`fetchContractsBase`, so the Redis contract set is bypassed entirely.

The in-memory pattern already exists twice: `fetchContractsWithFiltering` reads
the cached set and filters through `filterContracts`, which already supports
`options.query` (`filtering.ts:113-130`, matching title / vendor name / product
names / contract type); and the MCP tools filter `getContractsList()` in memory
including order-number matching (`app/lib/mcp/tools/cpm/contracts.ts:41`,
`:386-405`). Search is the one surface that queries the DB instead.

**F2 — `fetchContractsBase()` is not request-deduped.** 10 callers. Each awaits
`getUserMetadata()`, awaits `getCacheService()`, does a Redis `GET` for the whole
enriched set, and `JSON.parse`s it. The v2 layer above it _is_ deduped
(`getEnrichedContracts`, `getContractsList`) and the investor module wraps ~24 of
its readers; this primitive underneath them was missed. Definition:
`app/lib/contracts/actions.ts:257`.

**F3 — The contracts layout loads every contract to render four numbers.**
`app/(app)/(cpm)/contracts/(views)/layout.tsx:24-40` calls
`fetchContractsWithFiltering` — full org set, fully enriched — and uses it only
for `contractCounts` (invoices, trials, NDAs, total). The layout has no Suspense
boundary of its own, so nothing in the contracts section paints until it
resolves.

**F4 — `findTopmostParent` is a per-contract, per-level DB walk.** One
`contract_relationships` query per hierarchy level
(`data/superuser/contracts.ts:1717`), called inside sequential `for` loops, so
cost is _contracts × depth_ serial round trips. Sites:

- `app/lib/budget/currencyUtils.ts:96` — `selectCountableContracts`, every report total
- `app/lib/contracts/utils.ts:146` — `filterLinkedChildInvoices`, monthly report
- `data/superuser/vendors.ts:653` — nested per vendor, with a vendor-level
  `Promise.all` that can flood the pool
- `app/lib/contracts/processing.ts:1016` — `groupContractsByVendor`

None of it needs the database: every row carries its `contract_relationships`
embed, `fetchAllRelationshipsForOrg` loads the same edges org-wide, and
`lib/inventory/hierarchyUtils.ts:236` is a synchronous twin already used by the
inventory and lineage code.

**F5 — `convertAllProductsToUSD` refetches FX rates once per contract.** Each
call runs `buildBaseCurrencyRates` with only _that one contract's_ start date
(`lib/v2/products/transforms.ts:427`). The span differs per contract, so the
`readDailyUsdRates` cache key differs, so each distinct start date triggers a
fresh paginated `fx_rates_daily` read — plus an uncached Redis `GET` through
`getLatestUsdRates`. Callers run it inside `Promise.all` over the whole set:
`app/lib/contracts/actions.ts:244`, `:306`, `:387`, `:471`;
`app/lib/vendors/actions.ts:62`. `enrichWithPricing` (`lib/v2/core/pricing.ts:82`)
already does the correct thing — one call for the entire set, hoisted above the
map.

**F6 — `getAllOrgUsers()` is a dead round trip at 26 call sites.** It runs
`select('*')` against every user in the org, maps to ids, and passes them to
`extendSupabaseQueryByUserRole`, which forwards to `extendQueryByUserRoleACL`
(`data/utils.ts:13-53`) — where `orgUserIds` is declared as a parameter and
**never read**. Distribution: `data/superuser/contracts.ts` ×12, `vendors.ts`
×8, `folders.ts` ×2, `app/lib/actions/contract-lineage-strategies.ts` ×2,
`inventory.ts` ×1, `app/api/contract/verify-upload/route.ts` ×1.

### High

**F7 — 16 embeds, no pagination, JSONB history for one boolean.**
`fetchContractsByUserRoles` (`data/superuser/contracts.ts:891-995`) selects `*`
plus 16 top-level embeds nested up to four levels, with no `.range()` or
`.limit()` anywhere in the builder. Two dominate the payload:
`vendor_products_details_versions (changed_data)` pulls every version row's full
JSONB for every product of every contract, and the only reader on this path is
`hasFeeOverrides` asking whether any version has `changed_data.fees !== undefined`;
and `contract_relationships → parent:contracts (* + vendor_products_details.*)`
ships a complete duplicate of every parent contract inside each child row.

**F8 — ACL round-trips every visible contract id through the app.**
`extendQueryByUserRoleACL` calls the `contracts_visible_to` RPC, receives the
full id list, and sends it back as `.in('id', visibleIds)` (`data/utils.ts:25-45`).
Extra round trip, thousands of ids in a `GET` query string, and a plan built
from a giant literal `IN` list. The RPC is `STABLE` SQL
(`supabase/migrations/20251112120851_contract_access.sql:3`) and could be
inlined as a subquery; the reason it can't be is that these paths use the
service client, which bypasses RLS, so the id set must be materialized
somewhere.

**F9 — `fetchAllRelationshipsForOrg` is uncached across 16 call sites.**
`select('*')` over the org's relationships with an inner join to `contracts`, no
`cache()` (`data/superuser/contracts.ts:114`). A render touching contracts,
inventory and a report pulls the same table three times. Also awaited serially
after the `Promise.all` in `getEnrichedContracts` (`lib/v2/contracts/service.ts:188`)
despite only needing `organizationId`.

**F10 — The Redis contract set is keyed per user.** Key is
`…:org:{id}:user:{id}:role:{role}:cur:{currency}`
(`app/lib/redis/cache-service.ts:22-31`), so every user stores their own full
copy of the enriched set as uncompressed JSON (`service.ts:90-123`). Fifty users
means fifty copies, fifty cold-start penalties, fifty entries to evict per write.

**F11 — Cache invalidation runs `KEYS` on every contract write.**
`clearOrganizationCache` issues `KEYS *org:{id}:*`
(`app/lib/redis/service.ts:220-236`). Redis is single-threaded and `KEYS` is
O(keyspace) and blocking, so one user saving a contract stalls cache reads for
everyone else on the instance. The leading `*` also defeats prefix optimization.
Called from `app/lib/contracts/actions.ts:108`, `:202`.

**F12 — A module-global `Map` caches hierarchy answers forever.**
`contractRelationshipCache` (`app/lib/contracts/utils.ts:100-104`) is documented
as persisting "during a single request" but is module-level, so on a warm Node
instance — and Fluid Compute deliberately reuses instances — it persists across
requests, users and organizations, unbounded and never invalidated. Relink a
contract and `filterLinkedChildInvoices` keeps returning the old answer until the
instance recycles. This is a correctness bug, not only a perf one. Phase 3
deletes it.

### Medium

**F13 — The global header ships the budget engine to the client.**
`HeaderContent` (`components/navigation/HeaderContent.tsx:64`, `:73`) renders
`HeaderSearch`, which renders two `'use client'` components that both import
`generateContractData` from `processing.ts`. That drags `app/lib/budget` (5,167
lines, including the 1,488-line `priceHistoryCalculator`), `dora`,
`lifetimeValueCalculator`, `date-fns` and all of `lodash` into the client graph
on every route. Confirmed in the build: `generatePriceHistory`,
`calculateDoraScore`, `isProductRow`, `supersededProducts` and `compoundedFees`
all appear in `.next/static` chunks.

Checked and clear: the service-role layer does **not** reach the client.
`currencyUtils` imports `findTopmostParent` from `data/superuser/contracts`, one
of the few `data/superuser/*` files with no `server-only` guard — but
`SUPABASE_SERVICE_ROLE_KEY` and the superuser strings appear in **zero** client
chunks. Tree-shaking cuts that edge.

The cost is not only bytes. The constraint has propagated into v2 —
`lib/v2/reports/transforms/invoices.ts:539`:

> Pure of server-only imports BY DESIGN: two 'use client' search surfaces import
> this module's caller (`generateContractData`), so reaching for the default
> segment context here drags `getContractsList`/`next-headers` into client
> bundles and fails the build.

And `processing.ts:493` carries the matching note: `invoiceSegmentCtx` is a
server-injected parameter that exists only because the module cannot build its
own context in a client graph. Two search boxes are shaping the invoice
segment-fee API in v2. Phase 1 releases that constraint.

**F14 — 35 modules do `import _ from 'lodash'`.** Whole-library imports, no
tree-shaking. `app/lib/utils.ts:16` is one of them and is imported almost
everywhere, so full lodash lands in nearly every bundle. `processing.ts:40` uses
it for exactly `_.get` and `_.groupBy`.

**F15 — `getContractsList({...})` defeats its own `cache()`.** React `cache()`
keys on argument identity. 30 call sites use the zero-arg form and share one
entry; 5 pass an object literal, each a new reference and therefore a miss. The
default is already `status: 'active'`, so `getContractsList({ status: 'active' })`
and `getContractsList()` are semantically identical but occupy separate entries —
and each miss re-runs the engine-spend stamping, described at
`lib/v2/contracts/service.ts:140` as two full `queryCommitments` passes. Sites:
`service.ts:574`, `cost-allocation/amounts.ts:152`,
`cost-allocation/invoice-report.ts:254`, `app/lib/mcp/tools/cpm/contracts.ts:41`,
`budget/price-history-legacy/server-components.tsx:26`.

---

## §3 `processing.ts` deprecation map

`app/lib/contracts/processing.ts` is 1,173 lines with 7 non-test importers, of
which **4 are already dead** (phase 0). The reports pages already run entirely
through `lib/v2/reports/service`.

| Importer                               | Uses                   | Status        | Action                                             |
| -------------------------------------- | ---------------------- | ------------- | -------------------------------------------------- |
| `app/lib/contracts/reportFiltering.ts` | `generateContractData` | Dead          | `filterReportContracts` has 0 callers; delete file |
| `app/lib/contracts/actions.ts:532`     | `generateContractData` | Dead          | `processContractsForMultipleReports` has 0 callers |
| `app/lib/contracts/actions.ts:45`      | `convertToUSD`         | Dead          | Imported, never referenced                         |
| `data/superuser/contracts.ts:39`       | `generateContractData` | Dead          | Imported, never referenced                         |
| `app/ui/search.tsx`                    | `generateContractData` | Live · client | Phase 1 — server action                            |
| `components/search/AiPromptSearch.tsx` | `generateContractData` | Live · client | Phase 1 — same server action                       |
| `app/lib/actions/export-report.ts`     | `generateContractData` | Live · server | Phase 7 — port onto `getReportData`                |

Where each export goes:

| Export                                                                                      | v2 equivalent                                                 | Status    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | --------- |
| `processBaseContractData`                                                                   | `lib/v2/contracts/transforms` · `buildContractTableRow`       | Swap      |
| `processContractFinancials`                                                                 | `lib/v2/core/pricing` · `enrichWithPricing`                   | Swap      |
| `groupContractsByVendor`                                                                    | `lib/v2/contracts/transforms:575` — sync, takes lineage edges | Swap      |
| `convertToUSD`, `getExchangeRate`, rate cache                                               | `lib/v2/core/baseRates` · `fxRates`                           | Swap      |
| `processContractMissingClauses`                                                             | `lib/v2/reports/transforms/missing-clauses`                   | Exists    |
| `processContractDoraScore`                                                                  | `lib/v2/reports/dora-data`                                    | Exists    |
| `processInvoiceData`                                                                        | `lib/v2/reports/transforms/invoices`                          | Re-export |
| Subrow builders, `processContractUsage`, `processContractRenewal`, `processContractNdaData` | No twin — move into `lib/v2/reports/definitions`              | Port      |

---

## §4 Notes for whoever picks this up

- **Size before scheduling.** `fetchContractsBase` already emits
  `processingTime` and `contractCount` on every cache miss
  (`app/lib/contracts/actions.ts:316-324`). That is enough to rank F2 and F5
  against a real org without new instrumentation.
- **Counts corrected during review.** An earlier pass of this audit overstated
  the embed count (24 → **16** top-level, nested 4 deep) and understated
  `getAllOrgUsers` (11 → **26**) and lodash importers (~20 → **35**).
  `fetchContractsBase` has **10** callers, not 11. If you find a count here that
  disagrees with a grep, trust the grep and correct this file.
- **The v2 layer is mostly right.** Where a legacy path and a v2 path disagree
  on how to do something (FX batching, hierarchy walking, vendor grouping), the
  v2 one is the correct pattern. This audit is largely a list of places the
  legacy path was never migrated.
