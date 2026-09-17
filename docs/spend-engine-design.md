# Spend Engine Design

Status: v2 — revised after codebase audit (2026-07-17)
Context: PSK-1850 exposed how fragmented the spend calculations are. We are
onboarding a banking customer where accuracy and auditability are hard
requirements, and the next feature (historical per-year spend) cannot be built
on the current structure.

## Problem

Spend math is split across two layers — period generation forked **three**
ways, slicing forked **six** ways.

**Period generation.** `generatePriceHistory`
(`app/lib/budget/priceHistoryCalculator.ts`) runs in three modes:

- `minimal` — cached on every `ContractWithPricing` by the enrichment
  pipeline; skips historical renewals, so cached histories cannot answer
  past-year questions.
- `full` — historical renewals + up to 3 projections (2 when a projected
  term already exists).
- `max` — price-history page only. The page's superseding model
  (`truncateSupersededAtChildStart`, `priceHistorySummary.ts`) is applied
  downstream by its vendor rollup — not inside `generatePriceHistory` — and
  disagrees with the pipeline's model (`enrichWithEffectiveFees`).

A **third generation fork** lives outside the app entirely:
`supabase/functions/email-contracts-alerts-weekly/budgetCalculator.ts` (and a
byte-identical copy in `test-alert-query/`) — 989 lines of Deno
reimplementation of `generatePriceHistory` + `getTermLength`. Its
`getTermLength` takes only dates (no `subscription_term` / `maxProductYear`),
so it cannot perform year-index reconciliation at all: the weekly alert
emails compute budgets with a decoder that has the PSK-1850 class of bug
baked in for multi-year contracts. This is a live accuracy risk, not just
tech debt.

**Slicing periods into time buckets.** Six independent conventions:

| #   | Where                                           | Convention                                  |
| --- | ----------------------------------------------- | ------------------------------------------- |
| 1   | `extractAmortizedData`                          | fee ÷ period months, spread monthly         |
| 2   | `extractActualCostData`                         | billing-date walk (PSK-1850 bug lived here) |
| 3   | `monthlyReportTransformers.ts` billing walk     | second, subtly different billing walk       |
| 4   | `extractRenewalsData`                           | fee bucketed on renewal date                |
| 5   | `distributeFeeAcrossYears` (price-history page) | whole fee in the period's start year        |
| 6   | `scripts/exportActualCostsByCcDate.ts`          | cc-date billing walk (one-off script)       |

Note on #3: `monthlyReportTransformers.ts` both _reuses_
`extractActualCostData` and _forks_ its own walk
(`extractActualCostPriceChanges`). Only the fork is a duplicate to delete;
its divisor is a pure date span (no term/year args), so it never had the
PSK-1850 bug — the two walks genuinely disagree.

Cross-cutting problems:

- Fiscal window is hardcoded to current FY / next FY. `getFiscalYearInfo`
  reads `new Date()` internally; ~15 further clock reads sit inside the
  calculators, including bare `new Date().getFullYear()` calls that ignore
  the fiscal context entirely (`priceHistoryCalculator.ts:1028,1067`).
  Untestable without fake timers; no arbitrary-year queries; several helpers
  accept an `asOfDate` but default it to `new Date()`, so determinism is
  partial at best.
- `feesUSD || fees` fallback appears ~19 times with `||` (breaks when a
  converted fee is legitimately 0), while newer paths
  (`priceHistorySummary.ts`, MCP `get_spend`) already use `??` — surfaces
  disagree _today_ on zero-fee handling, so unification will change some
  numbers and goldens must pin per-consumer.
- Multi-year fee schedules (`year` 1/2/3 on `vendor_products_details`) are an
  index that every consumer re-decodes into dates independently — the
  backwards term split, the `getTermLength` tie-breaker, the PR #1594
  virtual-extension guard, `calculateContractYear`, renewals grabbing
  `lastYearProducts`, plus `productSelectionStrategy.ts`, `getNextYearFees`,
  `lifetimeValueCalculator.ts`, and the Deno fork's date-only
  `getTermLength`. Each re-derivation can disagree; PSK-1850 was exactly
  such a disagreement.
- No single place can answer "what does contract X contribute to month M, and
  why" — the PSK-1850 audit page had to reimplement formulas to show them.

## Goals

1. One engine, one segment model, consumed by every surface (chart, monthly
   report, price history, exports, MCP tools, chat tools, budget table,
   dashboard, weekly alert emails).
2. Arbitrary time windows: any fiscal year (past or future), ranges — not
   just current/next.
3. All bases as first-class, named conventions: committed, amortized, actual.
4. Proration as an explicit policy (daily and monthly both supported).
5. Deterministic: `asOf` is an input, never read from the clock inside the
   engine.
6. Auditability: every result can explain its own derivation down to the fee
   source.
7. Exactly one decoder of year-index fee schedules and one lineage model —
   including retiring the Deno fork.

## Non-goals / decisions already made

- **No schema changes.** `effective_from`/`effective_to` on fee rows was
  considered and rejected: year indices are _relative_ encodings and survive
  renewals — stored absolute dates would go stale the moment a term rolls
  forward, and the document-extraction pipeline would have to produce them.
  Segments (below) are derived in memory, never persisted.
- **Invoice-based actuals are out of scope for the first iteration, but the
  contract reserves room for them.** Product has confirmed (2026-07-17) that
  today's "spend" is expected spend and invoice-derived actuals will be
  stored down the road. The engine models this as the `source` axis:
  `'expected'` now, `'invoiced'` later. Historical windows under
  `source: 'expected'` are still a model (projected renewals, assumed
  increases), even for past years.

### Decisions from the audit round (2026-07-17)

1. **Lineage feeds the resolver; it is not a post-pass.** Supersession
   determines _which_ segments exist (a superseded contract must not emit
   renewal projections), so the resolver takes the lineage graph as input.
   Reconciling the three existing superseding behaviors (see Layering)
   remains an explicit semantic decision, made in phase 4 under golden
   tests — including preserving the parallel-SOW protection.
2. **Currency is an injected policy; near-term mode is pre-converted USD.**
   Today `convertAllProductsToUSD` runs inside `fetchContractsBase` _before_
   the Redis cache, so contracts reach the engine already converted, and the
   cache key carries no currency dimension. The engine therefore ships with
   `CurrencyPolicy = { mode: 'preconverted-usd' }` matching the real
   pipeline. Native-currency segments are the target state, delivered
   jointly with psk-1796 part B (which already has to touch
   `convertAllProductsToUSD` and add a currency dimension to the cache key).
3. **Renewals and TCV are sibling query types, not bases.** They answer
   "what renews when" (event view) and "what is the total obligation"
   (stock view), not "spend over time." Forcing them into the basis enum
   would muddy it; `queryRenewals` and `queryTCV` run over the same
   `FeeSegment[]`.
4. **The weekly-alert edge function moves server-side.** The Deno fork
   cannot import `lib/v2`, so "port it" is not an option. The weekly-alert
   budget computation moves into the app (Inngest job or internal route the
   function calls); both Deno `budgetCalculator.ts` copies are then deleted.
   This gets its own migration phase.
5. **#1594 (Year-as-renewal-hint) = renewal hint, not a committed 2nd year.**
   When the recorded term is shorter than the product year-rows imply (e.g. a
   12-month term with a year-2 fee row), the recorded term is the commitment;
   the extra year-rows (year 2..maxYear) become successive `renewal-projection`
   segments seeded from their recorded fee (tagged `inferred`). Amortized/actual
   spend is unchanged; committed TCV drops and the fee shows in projected
   renewals. Implemented (commit `a2d94157`) — an intentional divergence from
   legacy's 24-month reading; the legacy golden is left untouched.
6. **Superseded fees = zero-at-cutoff, not replace.** The parent's pre-amendment
   history is preserved; from the amendment's start date the amendment fee
   governs and the parent stops contributing to totals. This is the
   price-history page's `truncateSupersededAtChildStart` model, replacing the
   budget surfaces' zero-everywhere `enrichWithEffectiveFees`. The phase-4
   investigation confirmed the only live numbers that move are on effective-fee
   surfaces (budget overview/table/dashboard/TCV, MCP `get_spend`) for a
   partially-superseded parent whose amendment cutoff is at/after its active
   period (mid-term / future-dated amendment) — the number goes UP, a
   correctness fix. The resolver computes cutoffs from real timeline transitions
   (later original start, or source→amendment role change), NEVER
   `product.isSuperseded` (dedup-polluted), and preserves the parallel-SOW
   guard. Lands in phase 4 as a product-signed-off set-B golden diff.
7. **fiscalYear numbering = the FY that STARTS in year N** (matches
   `getYear(currentFiscalYearStart)`); **committed year-bucketing = FISCAL**
   (default fiscal config = January, org-configurable). The price-history page's
   current calendar-year committed bucketing becomes a visible fiscal change on
   port. Implemented (commit `f2d0b4c9`).
8. **Inactive contracts — inclusion vs. computation.** INCLUSION (whether an
   inactive/archived contract is in the query set) is a caller/fetcher decision,
   not the engine's — it lives at `lib/v2/contracts/service.ts`
   (`getActiveAndArchivedContracts` etc.; the price-history page + MCP
   `get_price_history` include archived, every other view excludes).
   COMPUTATION (an included inactive contract caps renewal projections at its
   latest recorded term end) is a resolver heuristic every consumer inherits.
   Domain rule: contracts are assumed active/renewing until actively marked
   inactive; `'inactive'` === "archived". Implemented (commit `b3eba925`).
9. **Annual-fee-repeat (2026-07-18, from the implementation audit).** A
   single-year fee row is an ANNUAL price. When the span it must cover holds
   more than one 12-month cycle, the fee repeats per cycle rather than being
   stretched across the span: (a) initial term — recorded dates spanning a
   clean multiple of 12 months (24/36), or exceeding an explicit 12-multiple
   `subscription_term` (legacy actual's "downward override"), emit one
   full-fee 12-month segment per cycle, a trailing partial cycle day-scaled,
   all tagged `inferred`; (b) renewals — a multi-year renewal term splits
   into 12-month slices each at the seed fee (a 24-month renewal costs 2×,
   matching legacy full/minimal), with `annual_increase` compounding per
   year-within-term. This resolves legacy's internal inconsistency (its
   initial term read the same shape as 1×, its renewals as 2×) in the UP
   direction, per product confirmation. Non-12-multiple spans with no shorter
   explicit term keep pricing the whole span (the `non-12-month-term` shape is
   unchanged), and legacy full's full-fee trailing stub (12+6 both at full
   fee) is deliberately NOT reproduced — it is the over-count max mode already
   refused. NOTE: the engine now diverges from max mode
   (`buildVendorPriceSummaries`) for single-year-row contracts with multi-12
   spans — a visible price-history-page change to confirm at its phase-5 port.
   Composes cleanly with #1594: hint years still seed from recorded
   future-year fees; the repeat rule only governs how a fee fills a
   longer-than-cycle span. Tests:
   `__tests__/v2/spend-annual-fee-repeat.test.ts`.
10. **Addendum term inheritance (2026-07-18 Berenberg sniff, JPM #3038;
    implemented at phase 5.0.1).** A child contract recording NO end date and
    NO `subscription_term` of its own adopts its direct relationship parent's
    `subscription_term` — whatever the parent is (MSA, Service Order, …), no
    type-specific rule — while keeping its own fees. Explicit data on the
    child always wins (an end date or own term suppresses inheritance), and
    invoice children never inherit. Plumbing: the fetch-layer builder
    (`lib/v2/spend/members.ts`, `buildParentTerms`) records each child's
    parent term as facts on `SpendLineage.parentTerms`; the resolver applies
    the heuristic and tags affected initial segments
    `inferred`/`parentTermInherited` for the integrity report. Without
    lineage input the silent 12-month default still applies (shadow behavior
    unchanged). Tests: `__tests__/v2/spend-members.test.ts`.
11. **Invoices never project renewals (2026-07-29, user decision).** An invoice
    (`type_id` 6) records a billing event that already happened; it is not a
    subscription that rolls forward. `generateRenewalSegments` returns nothing
    for one — its recorded segments still stand, so the fee counts exactly once
    on its own dates. **This REVERSES the 2026-07-18 finding that "standalone
    invoices annualizing via auto-renewal is CORRECT (FactSet #3000)."** That
    was verified on a single invoice in isolation; the WM Datenservice series
    showed the failure mode at scale — Berenberg records each half-year as its
    own invoice, so the 2024 H1 invoice was projecting into FY2026 alongside
    the real 2026 H1 invoice, thirteen overlapping obligations for one service.
    Legacy has NO invoice awareness at all (`priceHistoryCalculator` never
    reads `type_id`) and rolled a 2024 invoice through five renewals to reach
    H2 2026. KNOWN COST, accepted: a forward budget now under-reports an
    invoice-billed vendor until the next invoice is recorded — WM's FY2026
    shows H1 only. The refinement considered and NOT taken was
    latest-invoice-in-series still projecting (keeps forward coverage, drops
    the phantoms) — it needs a heuristic for "same series" because these
    invoices carry no lineage, so it would ship `inferred` with a reason.
    `SPEND_ENGINE_VERSION` → 3. Tests:
    `__tests__/v2/spend-invoice-no-projection.test.ts`.
12. **Commitment valuation is a mode, not a separate view (2026-07-29).**
    `queryCommitments` takes `valuation: 'term' | 'annual'`. `'term'` puts a
    multi-year obligation's FULL value in the year it was agreed (a 36-month
    deal at 100k/yr shows 300k once); `'annual'` gives each 12-month slice its
    own year (100k × 3). This **reinstates the TCV question** that 5.2.1
    removed as a standalone toggle — as a valuation of Commitments rather than
    a fourth view. NOTE it is not the same chart as the old TCV view: that
    bucketed at term END ("when does value roll off"), this buckets at the
    commitment/action date ("how much did we commit, and when"). `queryTCV` is
    consequently orphaned for the chart. Only the `'term'` mode genuinely needs
    the event machinery — `'annual'` places money exactly where
    `basis: 'committed'` does. Tests:
    `__tests__/v2/spend-commitment-valuation.test.ts`.
    UI status (2026-07-29, after the psk-1844 spec review): the overview's
    method dropdown carries the ticket's three methods — Amortized | Actual
    Cost | Contract Term — with the 'term'/TCV valuation dropped from the UI.
    RECOGNITION RESOLVED (2026-08-04, product review): Contract Term =
    `queryCommitments` at `valuation:'annual'`, **`recognition:'term-start'`**
    — the ticket's literal wording. The provisional cancel-by dating
    (2026-07-29) was reverted after product flagged that a renewal's
    deadline-month entry ("the ICE October cell") should not count toward
    that FY's spend; start-dating puts exactly one year-slice per contract
    per FY and now matches the price-history surface, closing the
    two-surfaces-differ flag. `'annual'` + `'term-start'` places money
    exactly where `basis:'committed'` does (test-pinned equivalence), and
    `enrichWithEngineSpend` stamps the table's columns from the same query
    so the surfaces stay in lockstep. The cancel-by mode remains in the
    engine (route-exposed, tested) for a possible future renewals-decision
    view.

13. **`groupBy:'group'` source = the repo-wide Business Group convention
    (2026-07-30, user decision at the monthly-report port).** Direct +
    folder-inherited ACL groups via `extractBusinessGroups`, falling back to
    the scalar `business_group` column — what the contracts table, exports,
    and MCP narration already display (six readers, one convention). This
    OVERRULES the monthly report's previous behavior (direct ACL names only,
    no folder inheritance, no scalar fallback — its own docstring claimed
    scalar) and the number move is deliberate: contracts previously
    "Unassigned" in the report land in their real groups, so the report
    finally matches the rest of the app. Multi-group contracts split evenly
    (cents-preserving, same as sponsors) so additivity holds. Noted, not
    acted on: ACL groups are permission grants doing double duty as a
    reporting dimension — if product ever wants a true cost-center
    dimension, that is a product feature, not a grouping tweak.
    Implementation: `parseGroups` (`lib/v2/spend/grouping.ts`);
    `querySpend`/event queries no longer throw for `groupBy:'group'`.
    Tests: `__tests__/v2/spend-group-by-group.test.ts`.

14. **Invoice window relevance = later of invoice date / billing-period end
    (2026-08-03, user decision).** An invoice (`type_id` 6) participates in a
    spend or event query only when the LATER of its invoice date
    (`execution_date`) and latest billing-period end (`term_end_date`) reaches
    the query window — `activity < window.start` excludes it. Either date
    alone misjudges real billing: an invoice can be charged up front for a
    future period (invoice date early, period end current) or in arrears, the
    typical case (period ended, invoice date current). WINDOW-relative, not
    asOf-relative: the price-history page's from-1970 windows keep every
    invoice (its invoice-series restoration from 5.2.5 is untouched); only
    forward windows shed old invoices. An invoice with no parseable date is
    never excluded. Applied inside `querySpend`/`runEventQuery`
    (`lib/v2/spend/invoiceRelevance.ts`), so every engine surface inherits
    it; the row-level companion `excludeStaleInvoices` runs at
    `getBudgetContracts` (budget table rows), `buildBudgetSummary` via
    `staleInvoiceCutoff` (dashboard totals incl. legacy TCV + topVendors),
    and the budget-export `kept` rows — all at current-FY start. NO
    `SPEND_ENGINE_VERSION` bump: inclusion sits outside the cached
    derivation; segments are unchanged. For well-dated invoices the engine
    numbers barely move (out-of-window segments already contributed
    nothing) — the real changes are stale rows leaving the budget table, a
    no-end-date invoice no longer smearing its defaulted 12-month span into
    the current FY, and stale invoices leaving the legacy scalar totals.
    Tests: `__tests__/v2/spend-invoice-relevance.test.ts`.

## Core concepts

### FeeSegment (derived, never stored)

The resolver decodes a contract's relative fee encodings into absolute dated
segments at query time:

```ts
interface FeeSegment {
  productId: number;
  from: string; // ISO date, inclusive
  to: string; // ISO date, EXCLUSIVE — segments are half-open [from, to)
  fee: number; // under 'preconverted-usd' policy this is USD (see CurrencyPolicy)
  currency: string;
  source:
    | 'year-entry' // a vendor_products_details row for this slice
    | 'compounded-increase' // annual_increase applied
    | 'manual-override' // hasFeeOverrides path: fee overridden, increase suppressed
    | 'amendment' // fee replaced by superseding contract
    | 'renewal-projection'; // projected renewal cycle
  confidence: 'explicit' | 'inferred'; // 'inferred' = a heuristic decided
  reason?: string; // required when confidence === 'inferred'; feeds the integrity report
}
```

Half-open intervals are load-bearing: every existing slicer windows with
`[start, end)` (that is what makes a boundary billing date land in exactly
one FY), and inclusive `to` dates would break window additivity. All
boundary comparisons are UTC.

All year-number interpretation, term-length reconciliation, degenerate-split
handling, renewal projection, annual-increase compounding, and supersession
awareness live in the resolver and nowhere else. Everything above it
consumes dated segments only.

### Query contract

```ts
querySpend(contracts, {
  basis: 'committed' | 'amortized' | 'actual',
  source: 'expected',               // reserved axis: 'invoiced' comes later
  window:
    | { fiscalYear: number }        // e.g. 2024 = the FY that STARTS in 2024
    | 'currentFY' | 'nextFY'        // sugar, resolved relative to asOf
    | { from: string; to: string }, // arbitrary range, half-open [from, to)
  granularity: 'month' | 'quarter' | 'year', // quarters are FISCAL quarters
  groupBy: 'total' | 'vendor' | 'contract' | 'product' | 'sponsor' | 'group',
  proration: 'daily' | 'monthly',   // amortized only; engine REJECTS with other bases
  currency: CurrencyPolicy,         // { mode: 'preconverted-usd' } now; 'native' with psk-1796
  asOf: Date,                       // "today" as an explicit input
  explain?: boolean,
})
```

Window / `asOf` / horizon semantics (pinned):

- `'currentFY'` / `'nextFY'` are sugar resolved _through_ `asOf` — the FY
  containing `asOf`, and the one after. Passing an explicit window plus
  `asOf` is legal: the window selects the period, `asOf` selects the
  "current" cycle and gates which projections are hypothetical.
- The **projection horizon derives from the window end**, not from `asOf`.
  Same inputs + same `asOf` → identical output; a past `asOf` reproduces
  what the model would have said then.
- `granularity: 'quarter'` means fiscal quarters (offsets from the org's
  fiscal-year start). Bucket keys must encode the fiscal year + quarter
  index unambiguously so a fiscal Q1 starting Oct 2025 cannot collide with
  calendar 2025-Q1.
- `groupBy: 'sponsor'`: `business_sponsor` is multi-valued. The engine
  splits the fee evenly across sponsors (fee ÷ count into each bucket),
  matching today's monthly-report apportionment — this preserves
  additivity (sum over sponsors = total). The source for `'group'` is an
  open question (see below).

Basis vs. source — two independent axes (per product, 2026-07-17: everything
the system computes today is **expected spend**, a model; true actuals come
from invoices, which will be stored "down the road"):

- **basis** = how fees map onto time.
- **source** = where the numbers come from. Only `'expected'` (term-math)
  exists today. `'invoiced'` is reserved: when invoice storage lands, it
  becomes a second source that reuses the same bases (an invoice amount can
  be shown on its billing date or amortized over its service period), and
  reconciliation = the same query diffed across the two sources. No second
  refactor.

Bases:

- **committed** — the full cycle fee lands in the bucket where the cycle
  starts. Today's "current budget" / price-history-page behavior. Right for
  renewal planning.
- **amortized** — fee spread over the service period. At year granularity
  this IS the prorated view the banking customer wants: a July-start
  contract contributes ~50% of its annual fee to the calendar year. No new
  math — a naming of what `extractAmortizedData` already does, over
  arbitrary windows.
- **actual** — billing-date walk. This is the UI's long-standing "Actual
  Cost" view and keeps that name (decided 2026-07-17: continuity with the UI
  and existing code beats a purist rename). `actual` is strictly a _timing_
  basis; it never implies provenance. Provenance is only ever expressed by
  `source`, so the pair reads naturally: (`actual`, `expected`) = spend as
  expected to be billed; (`actual`, `invoiced`) = spend as actually billed.
  Naming rule for docs/tickets: the word "actual" alone never answers "is
  this real?" — say "expected actuals" or "invoiced actuals" when provenance
  matters.

Both `committed` and `amortized` remain supported everywhere; which one a
given surface shows by default is a per-surface product decision (open).

Proration: internals compute at a **daily rate** (fee ÷ period days × days in
bucket) — exact conservation, correct partial months and mid-period
amendments. `proration: 'monthly'` reproduces today's month-granular behavior
and is the **default** (decided 2026-07-17); `'daily'` is opt-in for surfaces
that need day-count precision. Monthly can be derived from daily; not vice
versa. Passing `proration` with a non-amortized basis is a runtime error, so
callers never believe `committed` is day-prorated.

### Sibling queries (same segments, different questions)

- `queryRenewals` — event view: one event per renewal-TERM start, valued at
  the full incoming term (a 24-month term is one 2× event, not two), One-Time
  and will-not-renew contracts excluded by construction (they project no
  renewal segments). Replaces `extractRenewalsData` (convention #4) and the
  chart's Renewals view. Legacy's cancel-by-date event positioning is a
  surface overlay to decide at the chart port, not engine semantics.
- `queryTCV` — stock view: total committed obligation (non-projected
  segments), bucketed at the committed end date. Replaces `extractTCVData`
  and the chart's TCV view.

Neither is a `basis`; both consume `FeeSegment[]` and share the resolver,
window, groupBy, and currency machinery. Implemented at phase 5.0.2
(`lib/v2/spend/queryEvents.ts`): the resolver stamps `termStart` on
renewal-projection segments so term events are rebuilt from segments alone,
never by re-running decoder heuristics.

### Layering

```
contracts — the LINEAGE-EXPANDED set (expandToLineageComponents),
            never the published-only set: a filtered-out superseding
            contract would silently drop the supersession edge
  │
  ▼
1. Fee-schedule resolver        contract + lineage graph → FeeSegment[]
  │                             (ALL heuristics; superseded contracts emit
  │                              no renewal projections; amendments become
  │                              'amendment' segments from their effective date)
  ▼
2. Slicers (pure)               sliceCommitted / sliceAmortized / sliceActual
  │                             (segments × window → line items)
  ▼
3. Aggregation                  groupBy + currency policy (single choke point)
  │
  ▼
4. Delivery                     lib/v2/spend/service.ts  (server callers)
                                app/api/spend route      (client chart, external)
```

Lineage reconciliation (phase 4) must unify **three** behaviors, not two:

1. `enrichWithEffectiveFees` (`lib/v2/core/pricing.ts`) — date-aware fee
   **replacement** from the superseding contract's start.
2. `truncateSupersededAtChildStart` (`priceHistorySummary.ts`) — hard
   **zero** at the cutoff. These two produce different totals for amended
   contracts; replace-vs-zero is a real semantic choice to record, not an
   implementation detail.
3. `buildCutoffsByContract`'s deliberate refusal to use lineage's
   `isSuperseded` / `deduplicateSiblingProducts`, which protects parallel
   SOWs (the M Science case). Naïve unification regresses this; parallel
   SOWs become a named resolver shape with their own golden test.

### Per-product breakdowns

Today only the price-history page has a per-product view: it reads
`period.productFees[]`, which every generated period already carries. The
spend slicers (`extractAmortizedData` / `extractActualCostData`) read only
period _totals_ — the monthly report displays product names next to
contract-level numbers, which is exactly the PSK-1850 confusion (a row
labeled "Broad Investment Grade Index" showing the whole contract's
$14,011/quarter instead of that product's $10,000).

In the engine this asymmetry disappears structurally: `FeeSegment` is
per-product from the bottom, slicing happens per segment, and
`groupBy: 'product' | 'contract' | 'vendor'` are successive sums over the
same line items — so per-product amortized/actual views exist in every basis
for free, and "product rows sum to the contract row" holds by construction
(conservation invariant 1 applies at every grouping level).

Two behaviors from `priceHistorySummary.ts` are correct today and must be
preserved in the engine:

- **Product series are keyed by `(contractId, productId)`, never by product
  name** — two distinct products sharing a display label must not merge, and
  the same product on two contracts must stay two series.
- **Amendment cutoffs apply per-product, not per-contract** — a superseded
  product's segments end at the amendment's start date while the contract's
  other products continue. Both behaviors live in the resolver's lineage
  handling (layer 1).

## Resolver spec — named contract shapes

Each shape becomes a named, unit-tested case. Known shapes from production
and the existing test suite:

| Shape                     | Example                                    | Interpretation                                   |
| ------------------------- | ------------------------------------------ | ------------------------------------------------ |
| Standard multi-year       | 36mo term, year 1/2/3 rows (ICE 3047)      | year N = Nth 12-month slice                      |
| Year-as-renewal-hint      | 12mo term, year 1/2 rows (PR #1594 target) | year 2 = projected renewal fee                   |
| Non-degenerate stub       | 27mo term, year 1/2/3 (Gartner 1504)       | backwards split, short year-1 stub               |
| Non-12-month term         | 18mo, single-year products                 | single segment per cycle                         |
| Annual fee, multi-yr span | 24mo dates or renewal_period, year-1 only  | fee repeats per 12-month cycle (decision #9)     |
| One-time                  | `renewal_type = 'One-Time'`                | no projected segments                            |
| Will-not-renew            | future end date                            | segments stop at term end                        |
| Amended                   | superseded products                        | amendment fee from effective date                |
| Parallel SOWs             | M Science                                  | siblings coexist; NOT superseded, no dedup       |
| Manual fee override       | `hasFeeOverrides`                          | `manual-override` segments; increase suppressed  |
| Dates ↔ term disagreement | dates say 12mo, subscription_term 36       | resolver decides ONCE; consumers never re-derive |

### Renewal fee selection — a stated model assumption

For multi-year fee schedules, renewal projections carry the **final year's
fee** forward (today: `lastYearProducts`; in the engine: the last dated
segment of the term seeds every `renewal-projection` segment, with
`annual_increase` compounding on top where present).

This encodes an assumption, not a fact: **price step-ups stick**. Year-1
pricing is typically the discounted teaser and the later-year price is the
"real" going rate, so projecting from year 3 — not an average, not year 1 —
is the defensible default. It is still a model choice a customer may probe
("why is FY2028 the year-3 fee?"), so:

- `explain` output names it explicitly on every `renewal-projection` segment
  ("projected from final-year fee; assumes step-ups persist").
- It is an assumption of `source: 'expected'` only — once `'invoiced'`
  exists, real renewals will show where the assumption was wrong, which is
  part of the reconciliation story.

When contract data is mutually inconsistent (dates vs. `subscription_term`
vs. product years vs. `renewal_period`), the resolver still resolves — but
marks affected segments `confidence: 'inferred'` and records the `reason`.
An **integrity report** (queryable via the engine, surfaced in an admin or
audit view) lists every contract with inferred segments so a human can
confirm. "We flag ambiguous contracts for review" is the accuracy story for
the banking customer; a handful of heuristics guessing independently is not.

## Explain output

With `explain: true`, every line item carries its derivation chain, e.g.:

> Jul 2026 actual = 14,011 — segment [2026-01-01 → 2027-01-01, 56,044 USD,
>
> > source: year-entry(year 3)] ÷ 12 months × 3-month billing interval; billing
> > date 2026-07-01.

Explain figures are reported in the query's currency policy (USD under
`preconverted-usd`) and labeled as such. The PSK-1850 audit page becomes a
thin renderer over this output instead of reimplementing formulas.

## Invariants (property tests)

Property tests run under `proration: 'daily'`, where the arithmetic is
exact; `'monthly'` is a month-granular convention on top of it.

1. **Conservation (amortized):** sum of amortized buckets across a segment's
   full span = segment fee. Exact under daily proration; under monthly, the
   whole-span sum is exact but boundary months are month-granular by design.
2. **Conservation (actual):** sum of billing events within a cycle = cycle
   fee.
3. **Reconciliation:** for a window aligned to whole cycles, actual total =
   amortized total. `committed` joins the equality only when the cycle
   start lies inside the window and the cycle is fully contained — a cycle
   that started in a prior FY contributes 0 committed but a full amortized
   share, by definition.
4. **No double counting:** half-open segments × half-open windows — a
   boundary date lands in exactly one bucket; overlapping periods (renewal
   boundaries) never contribute twice.
5. **Window additivity:** querySpend(FY2024) + querySpend(FY2025) =
   querySpend(2024 → 2025 range). Holds because all intervals are
   half-open; scoped to grouping keys that partition (sponsor splitting is
   even, so it partitions too).
6. **Determinism:** same inputs + same `asOf` → identical output. Requires
   phase 1's clock-injection cleanup — no `new Date()` anywhere inside the
   engine, including the currently-bare `getFullYear()` reads.

PSK-1850 would have been caught by invariant 2 alone. Golden-file tests pin
current outputs for known contracts (3047 and the named shapes) before any
consumer migrates. **Two golden sets bracket phase 4**: set A pins
pre-unification behavior (phases 1–3); phase 4's deliberate lineage change
produces set B via a reviewed, documented diff for amended contracts —
goldens are a change detector, not an immutability oath.

## Caching

Derivation is cached keyed by **max(`updated_at`) across the whole lineage
component** + horizon (+ currency mode once `'native'` exists), layered on
the existing Redis contract-set cache. A single contract's `updated_at` is
insufficient: when a superseding contract changes, the superseded contract's
segments change but its own `updated_at` does not.

## Migration phases

Each phase ships independently; risky decisions come after the safety net.

1. **Extract without behavior change + clock injection.** Create
   `lib/v2/spend/`; move the extract functions behind `querySpend` (window
   still current/next); old functions become deprecated wrappers passing
   `asOf = new Date()`. This phase MUST also fix the stray clock reads
   (bare `getFullYear()` calls, defaulted `asOfDate` params) — without
   that, output is not a pure function of `asOf` and goldens cannot be
   pinned under fake timers. Land invariant + golden tests (set A).
2. **Resolver.** Implement lineage-aware FeeSegment resolution with the
   named shapes; slicers consume segments. Integrity `reason`s recorded but
   not yet surfaced. Port the other year-index decoders
   (`productSelectionStrategy`, invoice-discrepancy's
   `calculateContractYear` anchoring, `getNextYearFees`,
   `lifetimeValueCalculator`) onto the resolver so it is genuinely the only
   decoder.
3. **Arbitrary windows + asOf.** Full-history segment generation with the
   window-derived horizon; retire the minimal-mode dependence for spend
   surfaces. Caching per the lineage-component key above.
4. **Unify lineage.** One superseding model reconciling all three behaviors
   (replace vs. zero decided and recorded; parallel-SOW shape preserved);
   delete `truncateSupersededAtChildStart` and the price-history page's
   private generation path. Golden set B with reviewed diff.
5. **Port consumers one at a time.** The full inventory (appendix below) is
   the checklist; headline order:
   - Budget chart → `/api/spend` (amortized/actual) + `queryRenewals` /
     `queryTCV` for its other two view modes — neither view is dropped.
   - Monthly report: delete the duplicate billing walk
     (`extractActualCostPriceChanges`); keep the sponsor/group
     apportionment as engine `groupBy` behavior.
   - Budget overview totals / budget table + dashboard widgets
     (`buildBudgetSummary` family) — a rollup consumer, not a slicer;
     named here because Goals promised it and the phase list previously
     missed it.
   - MCP tools: `get_spend`, `get_spend_breakdown`, `get_price_history`,
     renewals/contracts/vendors narration. Chat tools ride the MCP
     auto-adapter; chat's TCV/ACV query helpers port to `queryTCV` /
     engine reads.
   - Exports (budget, report, monthly-report XLSX) and the two one-off
     actual-cost scripts (fold the cc-date variant in or delete it).
   - Calendar and `lib/v2/core/filters.ts` budget-range filters.
   - Price-history page (`basis: 'committed'`, `granularity: 'year'`).
     NOTE: today's page buckets by _calendar_ year of period start and
     intentionally leaves gap years for super-annual periods — porting to
     fiscal-year committed is a visible output change to confirm with
     product, not a lift-and-shift.
6. **Weekly alert emails server-side.** Move the weekly-alert budget
   computation into the app (Inngest job or internal route the edge
   function calls); delete both Deno `budgetCalculator.ts` copies. Until
   this ships, alert-email numbers are documented as divergent.
7. **Explain + integrity report surfaced; delete legacy paths.** Legacy
   deletion must name which cached-`priceHistory` readers have been ported
   vs. which keep the cached field — the field is read well beyond spend
   surfaces (see appendix), and wholesale removal breaks calendar, filters,
   and narration consumers that were never in earlier phases.

## Appendix: consumer inventory (audit, 2026-07-17)

"Cached?" = reads the minimal-mode `priceHistory` cached on
`ContractWithPricing`. Consumers without tests need golden pins before their
port ships.

| Surface                                                    | Primitives                                                             | Cached? | Phase | Tests                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------- | ------- | ----- | ------------------------- |
| Budget chart (`priceHistoryChartUtils.ts`)                 | amortized/actual/renewals/TCV extracts, `getTermLength`                | yes     | 5     | actual-cost-chart, budget |
| Budget overview totals / table (`lib/v2/core/budget.ts`)   | `buildBudgetSummary`, `extractBudgetFromPriceHistory`                  | yes     | 5     | budget (partial)          |
| Dashboard widgets (`lib/v2/dashboard/service.ts`)          | `buildBudgetSummary`                                                   | yes     | 5     | none                      |
| Monthly report v2 (`lib/v2/reports/monthly-report/`)       | amortized/actual extracts; sponsor/group apportionment                 | yes     | 5     | monthly-report            |
| Legacy report transforms (`monthlyReportTransformers.ts`)  | own billing walk (#3), `getTermLength`                                 | via arg | 5     | none                      |
| Exports (budget / report / monthly XLSX)                   | `extractChartData`, `generatePriceHistory('full'/'minimal')`           | no      | 5     | none                      |
| MCP `get_spend` / `get_spend_breakdown`                    | actual/amortized extracts, `effectiveFeesUSD`, report layer            | yes     | 5     | spend-guidance only       |
| MCP `get_price_history`                                    | `buildVendorPriceSummaries` (max mode)                                 | partial | 4/5   | price-history-tool        |
| MCP renewals / contracts / vendors                         | reads + generates projected `priceHistory`                             | yes     | 5     | none                      |
| Chat `calculate_spend` + query helpers (TCV/ACV)           | extracts, `computeContractBudgetValues`, `extractTCV`                  | yes     | 5     | none                      |
| Price-history page (`priceHistorySummary.ts`)              | max mode, `truncateSupersededAtChildStart`, `distributeFeeAcrossYears` | partial | 4/5   | price-history             |
| Calendar (`lib/v2/calendar/transforms.ts`)                 | passes `priceHistory` through                                          | yes     | 7     | none                      |
| Core filters (`lib/v2/core/filters.ts`) + transforms       | `annualContractValueUSD` range filters                                 | yes     | 7     | exclude-invoices partial  |
| Invoice discrepancy (`lib/v2/reports/transforms/invoices`) | `calculateContractYear` (year anchoring)                               | via     | 2     | invoice-discrepancy       |
| Product selection (`productSelectionStrategy.ts`)          | `calculateContractYear`                                                | —       | 2     | via budget                |
| Weekly alert edge fn (`budgetCalculator.ts` ×2)            | own forked generator + date-only `getTermLength`                       | no      | 6     | none                      |
| Actual-cost scripts (incl. cc-date variant)                | `extractActualCostData`, `getTermLength`                               | via     | 5     | none                      |
| PSK-1850 audit page                                        | extracts + reimplemented formulas                                      | yes     | 7     | actual-cost-chart         |
| Enrichment pipeline (producer)                             | `generatePriceHistory('minimal')` — writes the cached field            | writes  | 1/3   | multiple                  |

Known consumer divergence to resolve during phase 5: chat `calculate_spend`
computes current-FY only, MCP `get_spend` merges current + projected FY for
straddles — the engine picks one and one surface's numbers change (open
question below).

## Open questions

_(fiscalYear numbering, committed vs. calendar bucketing, #1594, and
replace-vs-zero are now decided — see "Decisions from the audit round" above.)_

- **Per-surface defaults:** which surfaces show committed vs. amortized by
  default (both stay supported everywhere). Phase 5, per surface.
- **Invoiced source — resolved in direction, open in timing.** Product
  confirmed spend today is expected spend and invoice-derived actuals will be
  stored later; the `source` axis reserves the slot. Remaining questions:
  when invoice storage is prioritized, and whether historical windows should
  visually disclose they are model-based until then.
- **Fiscal-year definition for past years:** if an org changes
  `fiscal_year_start_month`, which definition applies to FY2024 queries?
  Recommendation (not yet ratified): the current setting applies to all
  historical queries (matching how relative year-indices already work); the
  answer also determines cache invalidation on setting change.
- ~~`groupBy: 'group'` source~~ — decided and implemented; see decision #13
  in the audit-round decision log (repo-wide convention: ACL groups incl.
  folder-inherited, scalar fallback, even split).
- **FY-straddle canonical behavior:** chat's current-only vs. MCP's
  current+projected merge (one surface's output changes). Arbitrary-window
  support makes the merge hack unnecessary; confirm at phase-5 port.
- **Integrity report placement:** internal-only vs. customer-visible.
- ~~Addendum term inheritance~~ — decided and implemented; see decision #10
  in the audit-round decision log. TOS parents remain a data quirk, ignored
  for now (decided 2026-07-18).
- **Stale-unconfirmed renewal projections (Berenberg sniff, Moody's #3017):**
  an ended, still-`unconfirmed` contract keeps projecting renewals per the
  domain rule (assumed renewing until archived) — correct behavior, but when
  the real renewal exists as a SEPARATE contract with genuinely different
  products (no lineage joins them; verified for #3017 vs #3014), the
  projection double-counts the vendor (€637k phantom in FY2026). Not a
  lineage bug — the remedy is workflow (archive the old term) plus an
  integrity-report flag: "term ended >N months ago, still unconfirmed,
  projecting renewals."
