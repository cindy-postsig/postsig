# Spend Engine — Progress & Handoff

Companion to `docs/spend-engine-design.md` (the design). This file is the
resume-from-here state. Last updated 2026-08-03 (invoice window-relevance
rule — design decision #14, see §5.2.7), branch `refactor/spend-engine`.

## CURRENT STATE — read this first

- **Branch was REBASED onto `development`** (2026-07-29, onto `cb6b3bad`;
  re-rebased 2026-07-30 onto `be365d42` — the merged PR #2039). **Every SHA
  below changed** — do not trust SHAs quoted in older sections, use `git log`.
- **Post-review session landed as `527126a7`** (after a full-branch code review
  of c3092cc9..HEAD): Contract Term = deadline-recognized commitments
  everywhere — cards, chart, AND the table's `engineSpend` columns issue the
  same query (5.2.3 item 7 — RESOLVED 2026-08-04: reverted to start-dating,
  see the 2026-08-04 bullet below);
  the TCV dropdown option is dropped; the spend route consumes the un-stamped
  `getEnrichedContracts` (enrichment measured: 53ms largest org / 13ms
  Berenberg); the psk-1855 notice-inheritance gap is recorded in the
  cancel-by section below.
- **The branch IS PUSHED** (2026-07-30 end of session):
  `origin/refactor/spend-engine` is current at `c5abcbe1`. The final push was
  a plain fast-forward, so the earlier force-with-lease guidance is history —
  push normally unless another rebase rewrites history again.
- Only 2 rebase conflicts, both commits development already had under a
  different SHA: the actual-cost multi-year fix (squash-merged as `b21c1cbc`,
  PR #1978 — took development's side, semantically identical) and the psk-1855
  cherry-pick (**skipped** — development has it natively as `471deac3`,
  PR #2031). A squash merge changes the patch-id, so `git cherry` reports such
  commits as "new"; expect this again on the next long rebase.
- **PR #2039 MERGED (2026-07-30 00:30Z) and the MERGE TRAP is RESOLVED**
  (2026-07-30 later session): the branch sits on the merged fix (`be365d42`),
  the engine port landed in `resolver/renewals.ts` (`renewal_period` →
  `subscription_term` → row-count chain), `SPEND_ENGINE_VERSION` → 4, and the
  coverage hole that let the trap fire SILENTLY is closed — a new
  `annualIncreaseRenewalCycle` shape (#2039: multi-year rows +
  annual_increase + 12-month renewals, renewalCount 2 in-window) pins the
  behavior in the goldens and the equivalence suite (verified failing
  pre-fix, passing post-fix). See the MERGE TRAP section below for the
  post-mortem.
- **5.2.4 monthly-report port landed 2026-07-30** as `18c6206c` (port) +
  `ad22335e` (shadow-diff harness) + `ef934471`/`646e94dc` (docs, amended) —
  see §5.2.4.
- **5.2.6 exports port landed 2026-07-30 (exports session):** golden pin →
  chart-export port (engine builder + psk-1844 sheets + dead-button
  deletion) → monthly-report formatter pin → duplicate-script deletion,
  four commits from the `test(spend): pin budget-chart export values`
  commit onward — see §5.2.6. **Same evening: the export exposed a real
  derivation-cache staleness bug (cards served old-FX segments all day);
  fixed by folding a fee digest into the component signature** — see the
  incident section after §5.2.6.
- **Later 2026-07-30 sessions landed (all pushed):** the dashboard Spend
  Overview flip (`84c59d71` — method selector in the card header driving
  cards + chart, `DashboardSpendOverview`), the #2039 merge-trap resolution
  (`04aae0cd`, engine v4), and the **5.2.5 price-history port**
  (`3c36de79` sliceActual conservation fix / engine v5, `e385a342` port +
  psk-1844 method selector, `44788c6c` shadow harness, `c5abcbe1` docs) —
  see §5.2.5 for the two bugs found and the recognition flag for Phil.
- Green after the rebase: 145 suites / 1705 tests; end of the 2026-07-30
  exports session: **151 suites / 1729 tests**, `tsc` clean, repo prettier
  clean.
- **2026-08-03: invoice window-relevance rule landed (design decision #14,
  §5.2.7)** — stale invoices (later of invoice date / billing-period end
  before the window) drop out of engine queries, the budget table's rows,
  the dashboard summary totals, and the export workbook. Full suite now
  **152 suites / 1749 tests**.
- **2026-08-04: Contract Term recognition RESOLVED — flipped to
  `'term-start'`** (product decision, closing 5.2.3 item 7). Product's
  review follow-up ("the ICE October cell shouldn't affect the spend calc")
  was the deciding vote: renewals now book in the FY containing their start
  date (psk-1844's literal wording), one year-slice per contract per FY,
  converging the overview/cards/table/export with the price-history
  surface. Flipped in the five recorded places; `spend-enrich` +
  `spend-cost-methods` gates re-pinned; export golden regen diff = exactly
  one move (fixture #903, 2026-12 → 2027-04). Cancel-by mode stays in the
  engine (route-exposed, tested) for a possible renewals-decision view.
  Same review, follow-up: `CommitmentKind` grew `'multi-year'` — under
  'annual' valuation only the slice that BEGINS a recorded term is 'new';
  later year-slices of a signed multi-year deal (S&P #3024's year-2 showed
  a "New" badge) stack with renewals in the chart and badge as
  "Multi-Year" in the popover. Presentational only — no totals move.
- **2026-08-04 (later): THE ROW FLIP LANDED — table rows read the engine,
  in native currency.** Product's "should projected be blank for
  invoices?" plus the user's "rows should simply read the engine" resolved
  the psk-1844 individual-rows flag in favor of engine rows. The engine
  gained a real `{ mode: 'native' }` currency policy: the resolver reads
  each product's original recorded `fees` instead of the pre-converted USD
  stamp — exact native cents, RESTRICTED to contract/product grouping
  (cross-contract sums and the cached route stay preconverted-usd until
  psk-1796 part B). `enrichWithEngineSpend` stamps both currencies
  (4 queries: 2 windows × 2 modes, memoized per contract+horizon+mode —
  roughly doubles the measured 53ms worst-org enrichment);
  `buildContractTableRow` prefers the stamps (native pair for display/CSV,
  USD pair for converted/effective fields), falls back to legacy reads
  when unstamped (archived view, monthly report), keeps engine values on
  multi-product parents instead of subrow fee sums (mirrors
  computeContractBudgetValues), and NULLS projected + annual difference
  for invoice rows — cells and CSV render blank, not $0 (decision #11 at
  row level). Rides `buildContractTableRow` everywhere: contracts-table
  Annual Cost, monthly-report renewals table, report tables,
  `exportReportCSV` (native, as before). Gates:
  `contract-transforms.test.ts` (engine-vs-legacy precedence, invoice
  blank, multi-product no-clobber — fixture deliberately ≠ subrow sum,
  legacy fallback), `spend-native-currency.test.ts` (native fee read
  through initial + renewal segments, stamp pairs), grouping restriction
  re-pinned in `spend-facade`/`spend-renewals-tcv`. Four mutations caught.
  Full suite 154 / 1764.

- **2026-08-04 (evening): FISCAL-YEAR SELECTOR built (§5.2.8).** The overview
  gained a `fy` URL param + `FiscalYearSelect` (replacing the header's static
  "Fiscal Year (Edit)" block, per the user) down to the oldest contract FY.
  Historical years: archived contracts INCLUDED (user decision — they were
  real spend then), rows filtered to contracts CONTRIBUTING spend that year
  (segment overlap ∧ invoice relevance), table date columns read
  resolver-generated point-in-time cycle dates (`EngineCycleDates` stamps —
  gap years and day-offset cancel-bys are derived, never read), a historical
  tile precedes the still-anchored Current/Projected cards (product request),
  chart toggles become FY${y}/FY${y+1}, export accepts the year. NO
  `SPEND_ENGINE_VERSION` bump — segments unchanged. Full suite **154 / 1776**.

- **2026-08-05: REBASED onto development `3995aa54` (psk-1890 EA contract
  types) + EAINV reconciliation, `SPEND_ENGINE_VERSION` → 6.** Three rebase
  conflicts, all from psk-1890's `isInvoiceType` refactor meeting our
  invoice rules and the 5.2.5 legacy-module deletion. Follow-up landed same
  session: every engine invoice rule now keys on `isInvoiceType` (Invoice 6
  - EA Invoice 13) instead of a bare `type_id === 6` — invoices-never-project
    (#11), window relevance (#14), the row's blank projected cell, and the
    price-history aggregation filter (which had gone inconsistent with its own
    page). `CONTRACT_TYPE_INVOICE` exports deleted from `lineage.ts` and
    `price-history/summary.ts`. EAINV fixtures pinned in all four gates
    (resolver mutation caught). Full suite **180 / 2174** with development's
    new tests.

## How to resume (fresh session)

1. Read `docs/spend-engine-design.md` (the design, incl. decisions 1–10 in
   the audit-round decision log) and this file.
2. The auto-memory `project_spend_engine_decisions.md` holds the product
   decisions (also summarized below).
3. Confirm everything is still green before changing anything — the guard set:
   ```
   npx jest postsig-nextjs/__tests__/v2/spend postsig-nextjs/__tests__/v2/asOf-determinism postsig-nextjs/__tests__/v2/budget-export
   ```
   Expect 32 suites / 275 tests green (2026-08-04 fiscal-year-selector session). Add
   `postsig-nextjs/__tests__/v2/monthly-report` and/or
   `postsig-nextjs/__tests__/v2/price-history` when touching those surfaces
   (the monthly-report pattern also matches the new XLSX formatter golden).
   The FULL suite is 154 / 1776
   (`npx jest "postsig-nextjs/__tests__/"` skips the worktree noise). Then
   `npx tsc --noEmit` (clean).
   **Scope the pattern to `postsig-nextjs/`** — a bare `__tests__/v2/spend` also
   matches `.claude/worktrees/*/__tests__/...` and drags in other branches'
   broken suites (48 failures that are not yours).
4. Optional but recommended, all read-only against prod via `.env.prod`:
   `npx tsx scripts/spend-sniff.ts` (engine over Berenberg, real lineage by
   default; `--no-lineage` for the per-contract-independent view),
   `npx tsx scripts/spend-shadow-diff.ts` (legacy chart pipeline vs engine,
   per-contract deltas; `--months` for monthly breakdowns),
   `npx tsx scripts/monthly-report-shadow-diff.ts` (§5.2.4, already
   attributed), and `npx tsx scripts/price-history-shadow-diff.ts` (§5.2.5,
   already attributed; oracle = the frozen
   `scripts/.legacy-price-history-summary.ts`).
5. Then: two independent threads. CODE: **next is the MCP-tools port — 5.2
   port-order item 4**: `get_spend`, renewals/vendors/contracts narration,
   and the FY-straddle resolution decided there; `get_spend_breakdown` and
   `get_price_history` already moved with their services, and chat tools
   ride the MCP auto-adapter. The EXPORTS port (item 5) is DONE — see
   §5.2.6 for what moved and the recorded non-export leftovers
   (invoice-folder CSV + contract.ts products-by-year are §5.3 decoder
   consolidation, exportReportCSV rides the row-transform flip). DATA: the
   Berenberg fixes under §5.2.2 NEXT are the user's item and gate the
   product review, not the ports.

## Status: Phases 1–4 + 5.0 + 5.2.1 COMPLETE. 5.2.2/5.2.3 built (overview chart + totals, psk-1844 method toggle); 5.2.4 monthly report + 5.2.5 price history + 5.2.6 exports PORTED; dashboard flipped; product review BLOCKED on Berenberg data fixes. NEXT: MCP tools (5.2 item 4).

The engine is feature-complete for its shadow scope and has survived three
layers of verification:

1. **Synthetic** — golden oracle (legacy re-executed live, deep-equality),
   resolver equivalence across all named shapes, engine-side invariants
   (conservation per billing frequency, determinism under two wall clocks),
   every new test gate mutation-tested.
2. **Full-branch audit (2026-07-18)** — subagent review of port fidelity vs
   legacy, test-gate quality, and the one legacy-touching commit (asOf
   injection, proven byte-identical). Every real finding was either fixed the
   same day or recorded below.
3. **Real-prod sniff (2026-07-18, user-verified)** — `querySpend` over
   Berenberg Bank's live contract set. Every number was confirmed correct or
   explained by a recorded workflow/design decision. See "Berenberg sniff
   findings" in Gotchas.

Nothing production-facing has changed — the engine runs in **shadow**
(`querySpend` has no production callers; legacy `app/lib/budget/*` and
`lib/v2/core/*` still power every live surface). Phase 5 is where it goes live.

Full commit log — **54 commits on top of `development`** as of the
2026-07-29 rebase onto `cb6b3bad`. SHAs shift on every rebase; regenerate
with `git log --oneline --reverse origin/development..HEAD` rather than
trusting this list after any history rewrite.

```
57cf8ef7  docs(spend): add spend engine redesign design doc
4becbfd1  test(spend): pin golden safety net for spend calculations
a151f8d1  refactor(budget): make now an injectable asOf across price-history math
0124eb86  feat(spend): scaffold querySpend facade and FeeSegment types
48ad1fbb  test(spend): add phase-1 conservation invariants
1f6f4936  feat(spend): add fee-schedule resolver with shadow equivalence tests
597855fa  feat(spend): treat #1594 shape as renewal hint, not committed second year
7635252c  feat(spend): add real slicers + window/bucket helpers
187ee92b  feat(spend): reroute querySpend onto resolver and slicers
ad8c21c1  refactor(spend): move inactive-contract projection cap into the resolver
1f4c57ff  feat(spend): open committed basis, arbitrary windows, quarter/year, daily proration
f827db39  feat(spend): open groupBy vendor/contract/product/sponsor
1013833f  docs(spend): add progress & handoff doc
f0c0a6bf  docs(spend): fold resolved decisions into the design decision log
2101e544  docs(spend): add gotchas/not-yet-built section to handoff
c17aa942  feat(spend): lineage zero-at-cutoff resolver + querySpend threading
22160e80  docs(spend): mark phase 4 done + phase-5 linked-invoice guardrail
7f4adb74  feat(spend): annual-fee-repeat — single-year fees repeat per 12-month cycle
550e9923  fix(spend): recover non-ISO manual dates instead of failing querySpend
7e3c7844  test(spend): engine-side conservation + determinism invariants
3ac7f8a9  fix(spend): inactive-cap boundary parity with legacy
0785da16  feat(spend): surface defaulted renewal length in segment metadata
2fe45524  docs(spend): record audit follow-ups addressed vs still open
799ae54a  feat(spend): real-org sniff harness + Berenberg findings
5fbb107a  docs(spend): addendum term inheritance is parent-agnostic
48604349  docs(spend): rewrite handoff for phase 5
4e1541ea  feat(spend): lineage-member builder + addendum term inheritance
494879a7  feat(spend): queryRenewals + queryTCV sibling queries
aebb3fee  refactor(spend): fiscalConfig as explicit query input
31818bc9  feat(spend): real-org shadow-diff harness + first Berenberg findings
736c4752  feat(spend): derivation-cache key machinery
5dc12987  docs(spend): refresh handoff — phase 5.0 done, 5.2.1 kickoff
731d12d0  test(spend): pin chart projected-FY goldens
d7ee4a9c  feat(spend): /api/v2/spend route + derivation-cache store
d050c3e3  feat(spend): engine chart + legacy comparison page
a31e2959  docs(spend): 5.2.1 mid-flight — route + chart shadow, commitments design
439f7a52  feat(spend): termStart on all segments + queryCommitments
9ff863ed  feat(spend): commitments sniff harness + Berenberg findings
0442822d  feat(spend): recognition-date bucketing for commitments
b6eeadd8  feat(spend): Option-B commitments chart on the engine wire
40eb3948  feat(spend): inherit MSA notice period into commitment recognition
54113211  feat(spend): FY-windowed committed spend behind the budget primitives
b7aedc18  feat(spend): totals shadow-diff + product audit workbook
1dc97668  docs(spend): 5.2.2 — overview port, psk-1855 adaptation, Berenberg data findings
2b099504  docs(spend): retract the increase-flattening finding, relabel data defects
953e2728  docs(spend): scope the annual-increase regression to real customer orgs
354f4427  docs(spend): cite psk-623 comments as intent for the annual-increase regression
7ea863d0  feat(spend): invoices never project renewals
5ce409c3  feat(spend): commitment valuation modes + psk-1844 cost-method toggle
d4261efd  docs(spend): record 5.2.3 — invoice + valuation semantics, psk-1844, queryEvents consolidation
1f8b2640  test(spend): pin psk-1844 cost methods on a mid-year contract
5ca1f241  docs(spend): record the cost-method audit on Berenberg
07a5ae3c  fix(spend): #1594 hint cycles no longer inflate later compounding
fc72613f  docs(spend): record the three-place merge trap for the annual-increase fix
```

## Architecture (as built)

```
Contract[]  (lineage-expanded set)      SpendLineage (buildSpendLineage(members))
   │                                        │
   ▼  lib/v2/spend/resolver/resolveFeeSegments.ts   ◄── lineageFor(lineage, id)
1. Resolver          contract (+ ContractLineage) -> FeeSegment[]   ALL year-index heuristics
   │                 termLength.ts / initialTerm.ts / renewals.ts / shapes.ts / lineage.ts
   ▼  lib/v2/spend/slicers/
2. Slicers (pure)    sliceCommitted / sliceAmortized / sliceActual   segments x window -> line items
   │                 window.ts (resolveWindow), buckets.ts (bucketKey), dates.ts (UTC)
   ▼  lib/v2/spend/querySpend.ts
3. querySpend        resolve per contract -> slice -> tag groupKey -> aggregate -> SpendResult
```

`querySpend(contracts, query, lineage = EMPTY_LINEAGE)` supports: basis
committed|amortized|actual · window currentFY|nextFY|{fiscalYear}|{from,to} ·
granularity month|quarter|year (fiscal) · proration monthly|daily (amortized
only) · groupBy total|vendor|contract|product|sponsor · asOf injected.
**Still throws** (decisions pending): `groupBy:'group'` (source unresolved),
`explain` (phase 6), native currency (psk-1796 part B).

Key invariants: FeeSegment intervals are half-open `[from,to)` UTC; a segment's
fee divisor is its OWN date span (never `subscription_term` — the PSK-1850 fix
by construction); horizon derives from window END, never `asOf`; invalid dates
degrade to no-segments, never a thrown error.

## Verification discipline (KEEP DOING THIS)

- **The oracle** `__tests__/v2/__goldens__/spend-goldens.json` pins LEGACY
  output (all `generatePriceHistory` modes, extractors, both billing walks,
  both lineage models) under a frozen clock. `spend-goldens.test.ts` asserts
  against it; `UPDATE_GOLDENS=1` regenerates (only for deliberate, reviewed
  changes). Set A is still intact — legacy has not moved all branch.
- Every change: keep the guard set green, run `tsc`, and **mutation-test new
  test files** (perturb the code, confirm the test FAILS, restore) so gates
  aren't vacuous. Don't trust self-reports — verify.
- **Real-data sniff** (`scripts/spend-sniff.ts`) before/after any resolver
  behavior change: numbers, dates, and terms a human can eyeball beat any
  synthetic fixture. Read-only against prod via `.env.prod`.
- Commits: atomic, conventional, `psk-1850` ref, **no AI/assistant references**
  (project rule — omit the harness's Claude-Session trailer). husky runs
  prettier+eslint on commit.

## Decisions locked (design doc decision log has full rationale)

- **#1594** = renewal hint, not a committed 2nd year (a2d94157).
- **Superseded fees** = zero-at-cutoff, truncate+day-scale mid-cycle straddles
  (phase 4, edd4bc48).
- **fiscalYear numbering** = FY that STARTS in year N; **committed bucketing**
  = FISCAL (f2d0b4c9).
- **Inactive contracts**: INCLUSION = caller/fetcher decision; COMPUTATION
  (cap projections at recorded end, boundary-inclusive) = resolver heuristic
  (b3eba925 + 0616cdf3).
- **#9 annual-fee-repeat** (4d70a919): a single-year fee row is an ANNUAL
  price — it repeats per 12-month cycle across clean multi-year spans and
  multi-year renewal terms (24-month renewal = 2× fee); trailing partial
  cycles day-scale; non-12-multiple spans price the whole span (unchanged).
  Berenberg has ZERO contracts with this shape — no number moves there.

## Phase 5 — port consumers one at a time (THE PLAN)

### 5.0 Pre-work (build once, before any surface flips)

1. **`LineageMember[]` builder** — ✅ DONE (2026-07-18, `lib/v2/spend/members.ts`).
   `buildLineageMembers` (drops linked child invoices per the
   `buildSpendLineage` guardrail, keeps standalone invoices, earliest lenient
   start), `buildParentTerms` (childId → direct parent `subscription_term`,
   facts only), `buildSpendLineageFromEnriched` (one-stop `SpendLineage`).
   **Addendum term inheritance implemented with it** (design decision #10):
   resolver applies a parent term only when the child has NO end date and NO
   own `subscription_term`; segments tagged `inferred`/`parentTermInherited`.
   `scripts/spend-sniff.ts` now builds real lineage by default
   (`--no-lineage` for the old per-contract-independent view). Berenberg
   verification: JPM #3038 inherits its parent's 12-month term (numbers
   unchanged, provenance now honest); real-lineage totals move ONLY for JPM —
   #3038's re-priced products (3799/3801, 8k→12.5k) cut Master #3040 at
   2024-04-16, removing a $16k/yr double-count (the recorded "2 genuine
   straddles"). Tests: `__tests__/v2/spend-members.test.ts` (19,
   mutation-tested).
2. **`queryRenewals` / `queryTCV`** — ✅ DONE (2026-07-18,
   `lib/v2/spend/queryEvents.ts`; design decision #3). The resolver stamps
   `termStart` on renewal-projection segments so queryRenewals rebuilds term
   EVENTS without re-running decoder heuristics: one event per renewal-term
   start in-window, valued at the FULL incoming term (24-month term = one 2×
   event). queryTCV buckets the committed (non-projected) total at the
   committed end date; a truncated superseded contract reports a scaled TCV
   at its cutoff. Both share window/groupBy/currency machinery via the new
   `grouping.ts` (extracted from querySpend, behavior-identical). Legacy
   cancel-by-date event positioning is deliberately NOT engine semantics —
   decide as a surface overlay at the chart port. Berenberg eyeball: FactSet
   #3000 renews per 2-month cycle, JPM #3040 renews at post-cutoff 16k,
   #3038 on inherited cycle, Moody's #3015 TCV 0 (known shell). Tests:
   `__tests__/v2/spend-renewals-tcv.test.ts` (15, mutation-tested; caught a
   real window-upper-bound gap).
3. **`fiscalConfig` as an explicit query input** — ✅ DONE (2026-07-18).
   `fiscalConfig: { startMonth }` is REQUIRED on `SpendQuery` and
   `SpendEventQuery`; the `contracts[0].users.organizations` inference and
   silent January fallback are deleted (the engine never reads fiscal config
   off contract rows). `FiscalConfig` moved to `spend/types.ts` (re-exported
   from buckets/slicers). Callers state the org's month — the sniff passes
   the org row's value. Non-vacuous: the April-fiscal axes test fails if the
   engine ignores the query value.
4. **Real-data shadow diff** — ✅ DONE (2026-07-18,
   `scripts/spend-shadow-diff.ts`; `--months` for per-month breakdowns,
   `ORG_ID=` for other orgs). Legacy side reproduces the chart pipeline
   (enrich → filterForAggregation → `generatePriceHistory('minimal')` →
   chart extractors); engine side runs querySpend/queryRenewals/queryTCV
   with real lineage over the SAME kept set, native fees both sides. Run it
   before every 5.2 flip. First Berenberg run: every delta attributed —
   recorded moves (#3040 straddle −16k, #3038 inheritance) plus the NEW
   findings now recorded in §5.1 (minimal-mode leading gap,
   increase-flattening, renewals/TCV semantics).
5. **Derivation cache** — ✅ KEY MACHINERY DONE (2026-07-18,
   `lib/v2/spend/derivationKey.ts`); store wiring deliberately deferred to
   the first high-volume port (5.2.1), where its call shape exists.
   `buildComponentSignatures` hashes the whole lineage component — member
   ids + each member's `updated_at` + intra-component edges — because
   max(`updated_at`) alone misses member DELETION and relationship
   add/remove/flip (both change derivations without touching surviving
   rows; mutation-tested). `derivationCacheKey` = contract ×
   component-signature × horizon × asOf-day × currency mode ×
   `SPEND_ENGINE_VERSION` (BUMP THE VERSION on any resolver/slicer behavior
   change). At 5.2.1: wrap resolveFeeSegments reads with this key on the
   Redis cache-service, layered on the contract-set cache. Tests:
   `__tests__/v2/spend-derivation-key.test.ts` (9).

### 5.1 Known number-moves to flag per port (all deliberate, all recorded)

- **Mid-term/straddling amendments**: engine truncates+scales the parent;
  legacy chart + monthly report double-count today. Visible chart change.
- **Effective-fee surfaces** (budget overview/table/dashboard/TCV, MCP
  `get_spend`): partially-superseded parent's number goes UP vs legacy's
  zero-everywhere replace (correctness fix, product-signed-off direction).
- **Decision #9 shapes** (maxYear=1, multi-12 span or renewal): committed and
  renewal totals move vs legacy max mode (price-history page) — legacy
  full/minimal already agree with the engine on renewal splits.
- **#1594 shapes**: committed TCV drops; fee moves to projected renewals.
- **Price-history page**: calendar-year → fiscal-year committed bucketing +
  the max-mode divergences above. Confirm with product at that port.
- **Chat vs MCP FY-straddle**: resolve the divergence (chat current-only vs
  MCP merged) — arbitrary windows make the merge hack unnecessary; one
  surface's numbers change. Decide at the chat/MCP port.
- **Chart minimal-mode leading gap (found by 5.0.4, Berenberg 2026-07-18)**:
  the live chart reads `'minimal'` price history, which generates periods
  only from the CURRENT projected cycle — FY months before it show $0 for
  non-FY-aligned auto-renewing contracts (Bloomberg #111 Jan–Feb 2026 = $0,
  legacy 120k vs engine 144k; JPM #3038 Jan–Mar). Engine fills them from the
  prior cycle — chart amortized/actual move UP. Correctness fix; flag with
  the chart port.
- **~~Chart minimal-mode increase-flattening~~ — RETRACTED 2026-07-29.** This
  entry claimed legacy fails to compound `annual_increase`, using Truvalue #112
  (legacy 5,500 vs engine 6,655) as the example. **It is wrong.** Legacy
  compounds correctly: 5,500 IS `5,000 × 1.1`, the right value for #112's 2026
  cycle. 6,655 is legacy's own **2027** figure — the engine is one renewal
  index ahead, not un-flattened. Two separate defects were hiding behind this
  label, neither of which is "legacy flattens increases":
  1. **`maxInitialTermYears` regression (LEGACY, live in prod).**
     `calculateTotalAnnualIncreases` advances `maxInitialTermYears` — the count
     of product year-ROWS — per renewal, instead of the renewal cycle's length
     in years. A 4%/yr contract with a year-2 row and 12-month renewals
     escalates 8%/yr; three year-rows escalate ~12%/yr. Introduced correctly at
     `67402d1a` (2025-05-13) as a LAST-RESORT fallback behind
     `renewal_period` → `subscription_term`; `e3f15df2` (2025-06-23, psk-623)
     deleted both guards while adding `annual_increase_months` support and
     promoted the fallback to the primary path, orphaning the comment that
     still describes the guard. **NOT intentional — psk-623's comments specify
     the opposite.** Sadiqa asked "should it fall back to renewal period length
     or subscription term?" and the answer was "renewal period first, then sub
     term" (psk-623 comments 14488/14489, 2025-06-20); `maxInitialTermYears`
     appears nowhere in that ticket. The commit's actual purpose was Sadiqa's
     separate report that "the increase is not applied during the 1st renewal"
     (14520) — a real fix to the `increases = 1` baseline that took the two
     guards with it. QA passed legitimately: the bug only fires at
     `renewalCount >= 2`, and in June 2025 nothing had been projected that far,
     so the symptom did not exist yet to be caught. Contract #341 (Dana) appears
     BOTH in Sadiqa's 2025 QA screenshots and in today's affected list.
     **26 contracts match the shape** (multi-year
     rows + `annual_increase_months` NULL + cycle ≠ maxYear×12), but 7 sit in
     demo/test orgs — **19 are in real customer orgs (`is_demo_org = false`),
     and 14 of those are `status = 'active'`**, i.e. currently wrong in a live
     budget. Concentrated: **Paloma Partners holds 8 of the 14** (Arcesium,
     4× DocuSign, FLEXTRADE, Enfusion, Thomson Reuters); the rest are Dark
     Forest ×3, Birch Hill, Citadel, Dana. Berenberg has only #112 and it is
     `unconfirmed` — this bug is NOT a Berenberg problem, despite surfacing
     there. e.g. Arcesium #765 projects 342,896 for 2030 where 3.75%/yr gives
     295,944 (+16%, compounding).
     Fix = restore the two deleted branches; all 26 record a `renewal_period` or
     `subscription_term`, and the currently-correct contracts are unaffected
     because `renewal_period == maxYear*12` makes both paths agree.
     **STATUS: FIXED both sides (2026-07-30).** Landed on development as
     PR #2039 (`be365d42`, absorbed by the re-rebase) and ported into the
     engine same day (`SPEND_ENGINE_VERSION` → 4) — see the MERGE TRAP
     post-mortem. The Truvalue #112 "+1,155 compounding" line in the §5.2.2
     residue attribution predates this and will shrink on the next
     shadow-diff run.
  2. **#1594 renewal-index off-by-one (ENGINE only).** Decision #1594
     reclassifies the year-2 row from initial-term-year-2 to renewal-1, so every
     later cycle's `renewalCount` is one higher than legacy's. `increases`
     starts at 1 on the assumption that the base fee is the initial term's final
     year and renewal 1 is a year later — but under #1594 the base fee IS
     renewal 1's recorded price, so the baseline double-counts. Correct 2026
     value for #112 is 5,500; fixing (1) alone still yields 6,050.
     NOTE: `annual_increase_months` (86 contracts) takes a months-based branch that
     is immune to (1) — a 36-month term with `annual_increase_months: 12` correctly
     earns one increase per year across a renewal. That branch has ZERO test
     coverage (every fixture sets it null); see the §5.3 coverage gaps.
- **Renewals-view semantics (5.0.4)**: legacy = ONE event per contract per
  FY (next-year fee, cancel-by positioning, bucketed at term-END month for
  Dec-ending terms); engine = one event per renewal-TERM start at the full
  incoming-term value — sub-annual cycles yield several events per FY
  (Moody's #3017 3×, Fitch #3012 3×, FactSet #3000 3×) and boundary events
  shift to the start month (ICE #3047 Dec-2026 → Jan-2027). Product framing
  decision at the chart port; cancel-by overlay stays a surface concern.
- **TCV semantics (5.0.4)**: legacy buckets TOTAL value at the CURRENT
  (assumed-renewing) term end and skips will-not-renew contracts; engine
  buckets RECORDED-COMMITTED value at the committed end — contracts renewed
  only by projection drop out once their recorded term is past (#111, #3040,
  #3048) and a will-not-renew contract's committed obligation counts
  (Trademo #88 +18,300). Decide the product story at the chart port.

### Phase 5.2.1 state — budget chart port (mid-flight, 2026-07-18)

Built and committed, all still SHADOW (no production surface flipped):

1. **Chart goldens** (9f498e1a): oracle extractor capture now covers all
   four view modes across BOTH fiscal years (amortized/actual projected
   added).
2. **`POST /api/v2/spend`** (048e53b4): one zod-validated engine query per
   request (`kind: spend|renewals|tcv`); response = engine items +
   `periods` (zero-fill axis) + `refs` (groupKey display metadata);
   fiscalConfig/currency server-set. Inclusion mirrors the chart surface
   exactly (`filterForAggregation ∘ filterToBudgetContracts`); lineage +
   component signatures over the FULL enriched set. Derivation-cache STORE
   wired here (`handlers/spend/derivation-store.ts`): mget up front →
   sync resolver into the engine via the new injectable `resolveSegments`
   seam → single mset flush after the query. Engine seams added with NO
   behavior change (no version bump): `enumeratePeriods`,
   `SpendQueryOptions.resolveSegments`, `LineageSource` input narrowing.
3. **`SpendChart` + `/budget/spend-compare`** (89024638): engine chart
   (react-query → pure `toChartData` adapter) rendered below the untouched
   legacy chart on live org data — the product-review surface. TEMPORARY
   page; delete at the flip.

**Decisions locked this session (user):**

- **Wire format is engine-shaped, never chart-shaped** — `SpendResult`
  vocabulary on the wire; "chart" exists only in the client adapter.
- **One query per request** (batch rejected); enabled by dropping the
  legacy shared Y axis — **per-view Y scaling is approved**.
- **Chart rethink (Option B, preferred direction)**: three views =
  Amortized (expense) / Actual (cash) / **Commitments** (new money
  committed). Commitments = one event per TERM — initial signing,
  recorded renewal, projected renewal — valued at the FULL term, stacked
  `new` vs `renewal`; One-Time initial terms included, will-not-renew
  keeps past commitments only. Standalone TCV toggle REMOVED (its
  question is answered per-term at commitment dates). Window toggles
  renamed to FY numbers (FY26/FY27, from `response.window.fiscalYear`).
- **Commitment recognition date** = `(outgoing term end − cancel_by_date
days)` when the offset exists, else incoming term start. `cancel_by_date`
  is a projectable day-offset column (number|null) — cancel-bys derive for
  EVERY cycle, recorded or projected. This replaces the legacy 3-step
  positioning cascade with one rule; the end-date fallback is obsolete
  (resolver always derives term starts).
- **Launch constraint**: Commitments cannot ship renewals-only — initial
  terms ("contracts starting fresh") must be in at launch.
- **Option A (minor) stays available for product**: flip amortized/actual
  only (bug-fix moves), renewals/TCV stay legacy one release. A vs B is a
  product call to be made on the compare page with real data.

**Recorded-terms model (CORRECTED 2026-07-18 — an earlier version of this
doc misdiagnosed a queryRenewals gap):** the resolver anchors on the
EARLIEST term-array entry (start AND end) and re-derives everything after
it as renewal projections — later recorded entries are ignored except for
the inactive cap. So recorded renewals DO surface in queryRenewals (as
cadence-derived projections), and legacy re-derives the same way (why
parity held). Real findings: (a) recorded renewal terms are re-derived,
not read — boundaries diverge from recorded truth only when a renewal
changed length/anniversary (the §5.3 multi-entry-term-array gap, now with
a mechanism); (b) recorded renewals classify as projections, so
queryTCV's "recorded-committed" counts only the first term (part of why
multi-term contracts drop out of engine TCV). **Data context (user):**
uploads of old contracts record only the INITIAL term; in-app renewals
then record the CURRENT term — the arrays usually hold those two with an
unrecorded gap between. The gap is fine for spend math (assumed-renewal
synthesis is the domain rule; synthesized cycles are tagged inferred).
**Do NOT backfill synthetic term entries at renewal time** (decided
2026-07-18): it stores guesses as facts and poisons the recorded-vs-
inferred distinction. The right follow-up is **snap-to-recorded** in the
resolver: a projected cycle overlapping a recorded term entry adopts its
recorded dates (and explicit confidence); gap cycles stay synthesized +
inferred. Separately-decided follow-up — it moves querySpend/TCV numbers
for changed-cadence contracts and diverges from legacy.

**Commitments engine support — ✅ DONE (2026-07-18):** `termStart` now
stamped on ALL segments (the whole recorded span is ONE committed term
sharing the recorded start; metadata-only — guard set green with ZERO
number moves, no assertion updates needed). `queryCommitments` in
queryEvents.ts: kind from segment source (non-projection = the recorded
commitment → `new`; projection → `renewal`), events valued at full terms;
`new` totals conserve exactly against queryTCV (test-pinned invariant).
`SPEND_ENGINE_VERSION` → 2 (segment shape changed; cached derivations
invalidate). Derivation-store resolver now memoizes within a request
(queryCommitments runs two passes). Tests:
`__tests__/v2/spend-commitments.test.ts` (6, mutation-tested).

**Berenberg commitments sniff (2026-07-18,
`scripts/spend-commitments-sniff.ts`, read-only):** every currentFY event
attributable. Term arrays confirm the upload-gap model — JPM #3040 holds
exactly [2026 current, 2019 initial] with 2020–25 unrecorded; Bloomberg
#111 holds FOUR entries (automated annual rolls accumulate);
`cancel_by_date` day-offsets present (30/60/90). Findings for the chart
port: (a) full-term valuation makes the KNOWN Moody's #3017 phantom
renewal 3× more visible ($1.9M 36-month term vs $637k/yr in legacy) —
strengthens the phase-6 stale-unconfirmed integrity flag and the
archive-#3017 remedy, flag at product review; (b) zeroed fee shells
(#3015) surface as $0 'new' events — the ADAPTER drops zero-value events
(legacy filtered zero-value contracts); (c) #3040/#111 projected cycles
ALIGN with their recorded current terms (cadence held) — snap-to-recorded
would change confidence only, not numbers, for these; (d) ICE #3047's
commitment lands in FY27 (term-start bucketing), where legacy charted it
Dec FY26 — the recorded boundary-shift example, now as window membership;
(e) vendor-level renewals executed as NEW contracts (#3014, #3006) appear
as 'new' commitments — correct, and the reason the stacked view needs
both kinds at launch.

**Recognition + redesigned chart — ✅ DONE (2026-07-18):** the recognition
rule lives in the ENGINE, not the adapter (the adapter only sees
month-bucketed periods; queryCommitments has the contract row):
'renewal' events bucket at `(outgoing term end − cancel_by_date days)`,
falling back to term start; 'new' events stay at term start. CRITICAL
companion fix: recognition shifts events EARLIER than term start, so the
projection horizon pads by each contract's cancel-by offset
(`commitmentHorizonEnd`, exported) or boundary events silently vanish
(ICE #3047's Oct recognition of a Jan term — caught by the tests). BOTH
queryCommitments passes use the padded horizon so a shared caching
resolver sees one derivation; the derivation store keys per contract
(`horizonEndOf`) and the handler uses `commitmentHorizonEnd` for
kind:'commitments'. Berenberg re-sniff verified: #3047 appears at
2026-10 ($56,044); #111 and #3040 move to December (their next terms
BIND in Dec via 60/30-day offsets, and their prior terms correctly drop
to Dec of LAST FY); no-offset contracts unchanged. Route grew
`kind:'commitments'` (items carry `kind`); `refs` needed NO renewal
metadata. SpendChart is now the Option-B chart: Commitments (stacked
new-vs-renewal, zero-value shells dropped, "New" badge in popover,
legend) / Actual Cost / Amortized, Current/Projected window toggles
(legacy vocabulary; the selected FY is named in the subtitle, sourced
from `response.window.fiscalYear` so non-January orgs label correctly),
honest per-view tooltips, no TCV toggle. Both axes auto-scale — the
hand-forced nice-interval Y domain / fixed tick count / every-X-label
`interval={0}` are gone, leaving recharts' `[0, 'auto']` baseline.
`toTcvChartData` kept (tested, exported) pending the A-vs-B decision.

### 5.2.2 Budget overview port + the Berenberg data findings (2026-07-29)

**Built (all on-branch, nothing merged to development):**

1. **Overview chart flipped** to `SpendChart` (`(overview)/server-components.tsx`).
2. **`currentBudget`/`projectedBudget` ported** (20bff89b). `enrichWithEngineSpend`
   stamps FY-windowed committed values per contract at the FETCH BOUNDARY
   (`getContractsList`, after `enrichWithEffectiveFees`) rather than changing ten
   call signatures — the boundary already has `fiscalYearStartMonth`, the
   relationships for lineage, and is async. `getUSDValue` /
   `computeContractBudgetValues` / `calculateBudgetTotals` prefer the stamped
   values, falling through to legacy when absent.
3. **psk-1855 adapted into the engine** (23f31dc1) — see the cancel-by section
   below.
4. **Two harnesses** (9dd76f4d): `scripts/spend-totals-diff.ts` (per-contract
   legacy-scalar vs engine-committed, `--amortized`, "ended before FY yet still
   contributing" bucket) and `scripts/spend-audit-workbook.ts` (the xlsx product
   reviews).

**Decision locked (user, 2026-07-29): current/projected = committed, FY-windowed.**
Legacy `currentBudget` is the fee of whichever cycle is ACTIVE
(`extractBudgetFromPriceHistory` → `currentActivePeriods[0].feesUSD`); the engine
reports every cycle STARTING in the FY. A contract whose active cycle began in a
prior FY now reports its upcoming renewal price. The SummaryCard tooltip already
claimed "total spend for the current fiscal year" — legacy never delivered that.
Scope decision: port the SHARED primitives (accepting that dashboard, vendors,
chat/MCP, DORA and all report definitions move together), not a page-local
override.

**TCV deliberately NOT ported.** `getEffectiveTCV` is a windowless scalar,
`queryTCV` a windowed event view; any window wide enough to catch every committed
end date drives the projection horizon that far out. Needs its own decision.

**Berenberg sanity check — the 40% gap was DATA, not engine semantics.** Prod
showed legacy $6.82M vs engine $9.59M. Neither the basis (amortized re-run moved
it 58.5%→56.3%) nor §5.1 explained it. Root causes, both since diagnosed:

- **Relationship rows with `active: null`** — the dominant driver ($1.83M native).
  WM Datenservice's invoices DO have parent #3099, but 8 relationship rows were
  written with `active: null` (created 2026-07-22, metadata `"retroactive": true`).
  `fetchAllRelationshipsForOrg` filters `.eq('active', true)`, so the edge is
  invisible, `isLinkedChildInvoice` never sets, and the invoices count standalone
  in BOTH systems — the engine then multiplies each by its cycle count (6-month
  term = 2.00×, 2-month = 4.00×). ~39 such rows fleet-wide. **Fix the flag and
  they filter out of both sides.** Needs its own ticket: whatever backfill path
  creates these does not set `active`.
- **Invoices orphaned by an archived parent** ($2.30M native, 6 contracts).
  Relationship is `active: true` but the parent is archived and therefore absent
  from the loaded set, so `buildContractHierarchyMap` drops the edge and
  `hasParent` is false. **PSK-1843** (Verified: Staging) auto-archives child
  invoices going forward; historical cases need the children archived by hand.
  NOTE: this is why the documented "archive #3017" remedy for the Moody's phantom
  did not work — the €637k simply relocated to its orphaned child invoice #3020.
  Berenberg's six are all Invoices, so PSK-1843 covers them all; 34 non-invoice
  cases exist across 9 other orgs and would prompt.

**After both data fixes the amortized delta falls from $2,098,903 to ~$28,280**,
and every dollar of that residue maps to a recorded §5.1 move (Bloomberg #111
leading gap +24,000, JPM #3038 leading gap +23,125, JPM #3040 amendment
truncation −20,000, Truvalue #112 compounding +1,155). That clears the porting
gate. Do NOT re-run the product review until the data is fixed — otherwise
product is judging artifacts.

**Cancel-by inheritance (psk-1855, PR #2031) — cherry-picked + adapted.**
`deriveCancelByDateFromParent` gives a service order an inherited cancel-by date,
but only on the ENRICHED wrapper; the engine consumes raw contract rows, so
commitments still recognized at term start for the 84% of service orders with no
notice period of their own. `buildParentNoticeDays` now carries the notice period
as a lineage fact alongside `parentTerms`, and `cancelByOffsetDays` falls back to
it. It reuses psk-1855's function rather than restating the rule, and carries
ONLY `noticeDays` — that function's resolved `date` counts back from the RECORDED
term end, whereas commitments recognize each PROJECTED cycle off its own outgoing
end. Caught a real bug: `runEventQuery` called its horizon function with two
args, so `commitmentHorizonEnd`'s padding silently did not apply inside
`queryCommitments`. No `SPEND_ENGINE_VERSION` bump — the resolver is unchanged and
horizon is already in `derivationCacheKey`.

KNOWN GAP (2026-07-29 review, deliberate): reusing `deriveCancelByDateFromParent`
means notice inheritance requires the child to record its OWN term end — the
function returns null without one, because the UI has no date to show. So a
child that inherits its TERM from the parent (no end date, no own
subscription_term — the JPM #3038 addendum shape that motivated `parentTerms`)
can never inherit a notice period, and its projected renewals recognize at term
start. Consistent-by-construction with the contracts table and calendar; the
cost is that the two inheritance mechanisms never compose. Revisit only if
product wants deadline dating for term-inheriting addenda — the fix would be
carrying `noticeDays` on its own eligibility rule rather than psk-1855's.

**NEXT (in order):**

1. **Fix the Berenberg data** — archive the 6 orphaned invoices (via the UI, not
   SQL: the route also busts the org Redis cache and the hook writes the activity
   log, and auditability is this customer's hard requirement), and set the 8
   `active: null` relationship rows to `true`. This is CUSTOMER-VISIBLE: their
   reported spend drops by roughly a third. Tell them first.
2. **Re-run** `spend-totals-diff` + `spend-shadow-diff`; expect ~$28k residue.
3. **Product review** on `/budget/spend-compare` with the workbook — now the
   psk-1844 method model, not A-vs-B. Bring the two Phil flags: table rows as
   "individual rows" (5.2.3 item 5) and the deadline-dating deviation from the
   ticket's start-date wording (item 7, provisional).
4. Then the flip steps: legacy budget suites + full validation gate, swap the
   dashboard / price-history-legacy call sites, delete the compare page.

**Known cost — MEASURED + PARTLY ADDRESSED (2026-07-29):** the engineSpend
enrichment (two `queryCommitments` passes over the full set) runs on every
`getContractsList` cache miss. Fixes landed: (a) the service split —
`getEnrichedContracts` (through effective fees, + relationships) is the
React-cached base, `getContractsList` layers the stamps on top — and the
`/api/v2/spend` route now consumes the BASE, so it no longer pays for stamps it
never read and no longer re-fetches relationships the service already had. An
overview page view therefore pays the enrichment once (SSR) instead of 4×
(SSR + 3 API calls). (b) a per-contract+horizon memo inside
`buildEngineSpendByContract` holds queryCommitments' two passes to one
resolution per window. Measured read-only against prod
(`buildEngineSpendByContract`, pure compute, median of 5): **largest org in the
fleet (715 contracts, 249 rels) ≈ 53ms; Berenberg (141) ≈ 13ms** — real but not
alarming. A `'engine spend enrichment completed'` debug log now reports the
duration in prod. Still open, recorded not blocking: the enrichment bypasses
the Redis derivation cache (cross-request reuse would need the store surface in
`lib/`), and the overview cards are client-fetched skeletons where they were
server-rendered — a first-paint UX note for the flip review.

### 5.2.3 Invoice + valuation semantics, psk-1844 (2026-07-29, later session)

1. **Invoices no longer project renewals** — design decision #11. Reverses the
   recorded FactSet #3000 finding; see the decision log for the full rationale
   and the accepted cost. `SPEND_ENGINE_VERSION` → 3.
2. **`valuation: 'term' | 'annual'` on commitments** — design decision #12.
   Wired through `queryCommitments`, the route schema, and a sub-toggle in the
   Commitments view (hidden for Amortized/Actual, where the question is
   meaningless and the route would 400 on the extra field). Defaults to
   **annual** so bars stay comparable to the other two views — flag for product,
   since Option B's original pitch was total obligation. _(Superseded by
   item 7 — the sub-toggle is gone: 'annual' rides Contract Term,
   'term'/TCV has no UI entry point.)_
3. **Recognition rule CONFIRMED unchanged** (a round trip landed back where it
   started): NEW commitments date at their own term start; RENEWALS date at the
   cancel-by deadline where an offset exists, and at the **first day of the new
   term** where none does. An earlier attempt to fall back to the outgoing
   term's last day was reverted at the user's direction. One useful artefact
   survived: the `queryRenewals` parity test now says "when no offset is
   recorded", because exact parity was already false for every contract that
   HAS an offset.
4. **Every view is start-anchored except TCV** (verified: `sliceCommitted`
   buckets at `segment.from`; renewals/commitments at term start). `queryTCV`'s
   term-END bucketing is a ported legacy convention answering a different
   question — "when does value roll off". With #12 it has no chart caller and
   `toTcvChartData` was already unused; keep one cycle in case a non-chart
   consumer surfaces during the remaining ports, then delete with the legacy
   extractors.
5. **psk-1844 (default cost calculation method) maps onto the engine with NO
   engine work** — Amortized → `basis:'amortized'`, Actual Cost →
   `basis:'actual'`, **Contract Term → `basis:'committed'`** (the ticket's
   wording, "the full contract value to the fiscal year containing the contract
   or renewal start date", is the committed basis verbatim — independent
   confirmation of the 5.2.2 mapping). Built `components/budget/SpendMethodCards.tsx`:
   a method toggle driving the two SummaryCards off `/api/v2/spend`
   (`groupBy:'total'`), with the ticket's tooltip copy.
   RESOLVED 2026-08-04: the psk-1877 admin setting is now the global default.
   It was built but hidden behind a constant in the settings page (#2037) and
   read by nothing; un-hid it, and `getDefaultCostMethod`
   (`lib/settings/default-cost-method.ts`) now resolves the org preference
   server-side for all four surfaces that own a `CostMethodSelect`
   (budget overview, spend-compare, price history, dashboard).
   `costMethodFromSetting` is the whole translation. `defaultMethod` is now a
   required prop on all three components so a new caller cannot silently pin a
   surface to one basis.
   `DEFAULT_COST_CALCULATION_METHOD` moved from `amortized` to `contract_term`
   (product call 2026-08-04) so an org that never opens the setting keeps the
   basis every surface already had — no silent re-basing of spend numbers on
   deploy. Berenberg gets Amortized by setting it, not by inheriting it. The
   constant is deliberately the _only_ default: `getOrgPreference` cannot
   distinguish "no row" from "stored value equals the default", so a divergent
   fallback in `getDefaultCostMethod` would show one method in settings and
   render another in the reports.
   FLAG RESOLVED — twice. QA first directed (2026-08-04) that the table
   follow the selected method; that shipped, then was REVERSED (product call
   2026-08-05) after a live check on contract 3017 (Moody's RDS, 3-year
   stepped term €507,850/€568,792/€637,047, inactive): amortized FY2025
   showed €625,671 (2 mo of year-2 + 10 mo of year-3 rate) and projected
   €106,175 (the Jan–Feb 2026 tail; inactive contracts project no renewals) —
   arithmetically exact, but the blended numbers match no recorded fee and
   read as garbage next to full-term date columns. Final position: the
   table's columns ALWAYS answer Contract Term regardless of the psk-1877
   selector, which re-bases only the cards and chart; psk-1844's "individual
   rows display the extracted cost as-is" stands. `method` came back out of
   the URL (client state again), `getBudgetContracts` lost its basis param,
   and `buildEngineSpendByContract` is deliberately un-parameterized.
   What SURVIVED the reversal: QA's other finding — product sub-rows showed
   TODAY's fee under a selected historical FY (`enrichWithPricing` pins
   `currentFee` to the `isActivePeriod` price-history period regardless of
   window). Fixed with per-product stamps (`productValues` →
   `engineSpend.products`, `groupBy:'product'`, native): on the
   historical-FY path, sub-rows collapse to one row per product answering the
   same windows as their parent. The current-FY view keeps the fetch-boundary
   fast path and the recorded per-product schedule. Superseded products keep
   the recorded fee for the struck-through display; the resolver excludes
   their fees from engine values anyway.
6. **Cost-method audit on Berenberg (read-only, 2026-07-29).** The toggle works
   — Amortized is meaningfully distinct on the cards. But two of the three
   methods land on the SAME number for this org:

   ```
   FY2026 totals (native)   amortized 2,097,621 · actual 2,184,319 · committed 2,184,319
   per contributing contract   Actual === Contract Term  22/22 (100%)
                               Amortized === Actual      16/22 (73%)
   ```

   Not a defect — at YEAR granularity Actual ≡ Contract Term for any cycle
   wholly inside the window, because every billing date lands in the same FY
   and they sum to the cycle fee. Sub-annual billing changes WHEN within the
   year, not the annual total. They separate only for a cycle that BOTH
   straddles the FY boundary AND bills sub-annually (a July-start quarterly
   contract puts two payments in FY26 and two in FY27); Berenberg's book is
   FY-aligned so it barely exercises that shape. Amortized differs precisely
   because it prorates the straddlers — psk-1844's whole point.
   At MONTH granularity all three are plainly different (amortized flat,
   actual spiky, committed lumpy at cycle starts), so the method toggle earns
   its keep on the CHART more than on the cards. Supports psk-1844's own hedge
   about deferring Actual Cost.
   DATA GAP: `billingMonths === 0` (`slicers/actual.ts:53`) bills the full fee
   once at the cycle start — identical to Contract Term by construction. Four
   contributing Berenberg contracts have no `billing_frequency` (16 across the
   wider set, plus some recorded as an empty string), so for those "Actual
   Cost" is a fallback rather than a computed billing schedule.
   FOLLOW-UP (QA 2026-08-05, contract 3120): Monthly Intelligence disagreed
   with the chart/export by ~€27 — the stale-invoice rule is window-relative
   (`querySpend.ts` checks `resolved.start`), and the monthly engine's
   month-anchored window called a March invoice (no end date → defaulted
   12-month span) stale while the FY-anchored chart kept its amortized
   share. Fixed by anchoring each report month's window at the start of the
   FY CONTAINING it (chart-identical verdicts by construction; the vetted
   chart is the reference). The December straddle anchors January at the
   next FY — matching that FY's chart, so a late-year invoice drops out of
   January on both surfaces together. Same-FY months share one window, so
   the report still pays two queries.
   FOLLOW-UP 2 (product decision 2026-08-05, same contract): an INVOICE with
   no end date, no subscription_term, and nothing to inherit no longer gets
   the silent 12-month span — its full amount books in its start month
   (`resolveFeeSegments` shims `subscription_term: 1`, reason
   `invoiceSingleMonth`; all bases agree by construction). Investigation
   also found 3120 HAS a parent (SO 3099) via relationship 697, but
   `active=null` — extraction-suggested links load only when `active=true`,
   so the invoice aggregates independently instead of being excluded as a
   linked child. This decision is deliberately INVOICE-ONLY: the same org
   carries 6 open-ended Service Orders (€387k/yr, one running since 2010)
   and 4 Addenda (€171k/yr) whose annual run-rate exists ONLY via the
   12-month default + assumed renewal; booking those once in their start
   month would zero FY2026 for them (or 12×-overcount if renewal length
   collapsed to a month). Extending to all types needs a separate product
   answer for evergreen contracts. With the smear shape gone, the
   stale-invoice rule matters only for invoices with recorded billing
   periods (whose activity date always reaches their span end), and the
   FOLLOW-UP 1 window anchoring is now belt-and-braces.

7. **Contract Term = deadline-recognized commitments; TCV dropped
   (2026-07-29, user decisions, post-review — two rounds).** ROUND 1: the
   review found the dropdown's "Contract Term — Annual / — TCV"
   (`kind:'commitments'`) numbers diverged from the table's committed
   `engineSpend` columns for any offset contract — recognition shifts a
   renewal into the FY of its cancel-by deadline (verified: 12-month cycle,
   90-day cancel-by → the FY26 card read 2× the committed column) — while the
   tooltip claimed the ticket's start-date wording. Per psk-1844's spec the
   dropdown became exactly the ticket's three methods — Amortized | Actual
   Cost | Contract Term — and the TCV option was DROPPED (no ticket
   counterpart). ROUND 2 (user decision): product liked the new/renewal
   split and the recognition rule is the point, so Contract Term STAYS a
   commitments query (`valuation:'annual'`, `recognition:'cancel-by'` —
   deadline where an offset exists, fallback to the new term's start) and
   consistency was restored the OTHER way: `enrichWithEngineSpend` now stamps
   the table columns from the SAME query (per-contract+horizon memo keeps the
   fetch boundary at one resolution per window), the tooltip says what the
   numbers do, and both harness scripts mirror it. This is a RECORDED
   DEVIATION from psk-1844's literal "fiscal year containing the contract or
   renewal start date" — raise with Phil alongside the item-5 flag. A
   `recognition:'term-start'` engine mode exists (route-exposed, tested),
   pinned equivalent to `basis:'committed'` under 'annual' valuation — the
   ready fallback if product insists on ticket-literal placement. The
   deadline-dating choice was PROVISIONAL (user, 2026-07-29), and the
   predicted revert FIRED (2026-08-04, product decision — see the CURRENT
   STATE bullet): `recognition:'term-start'` now set in `costMethodInput`,
   `enrich.ts`, `budget-export/engine.ts`, and the two harness scripts.
   Gates re-pinned: `spend-cost-methods.test.ts` (mapping lockstep + export
   renewal at its start), `spend-commitments.test.ts` (term-start ≡
   committed equivalence), `spend-enrich.test.ts` (offset renewal stays in
   its start FY: FY26 1×, FY27 1×).

**Open question — WM sizing.** WM's Service Order #3099 (2010, no end date)
projects 178,767/yr; its invoice series implies ~700k/yr. Fixing the 8
`active: null` rows will silently pick the Service Order by filtering the
invoices as linked children. Decide which is WM's real spend BEFORE that fix,
or the answer gets chosen by accident.

### MERGE TRAP — FIRED 2026-07-30, RESOLVED same day (post-mortem)

`fix/annual-increase-renewal-period` merged as PR #2039 (`be365d42`) and the
morning re-rebase absorbed it, healing the LEGACY copy while
`lib/v2/spend/resolver/renewals.ts` still carried the faithful bug port —
exactly the predicted half-fired state (engine escalating ~12%/yr where
legacy compounds 4%/yr on the 36-month/12-month-renewal shape).

**The trap's "breaks loudly" prediction was WRONG**: goldens and equivalence
both stayed green because NO fixture combined multi-year rows with
`annual_increase` — the safety net had a hole precisely on the bug shape.
Resolution (in order): (1) added the `annualIncreaseRenewalCycle` shape
(id 2039, term 2022–2024, years 1/2/3, 4%/yr, 12-month renewals — its
renewalCount-2 cycle lands inside the pinned FY2026 window) to the golden
capture AND the equivalence list; (2) regenerated goldens (additions-only
diff — existing keys unchanged, confirming legacy's change was previously
unexercised); (3) verified equivalence FAILED (901.33 vs 974.88/mo);
(4) ported the fix (`renewal_period` → `subscription_term` → row-count) and
bumped `SPEND_ENGINE_VERSION` → 4; (5) all green, lockstep re-verified
empirically (identical projected fees through 2029).

Lesson recorded: a change-detector golden only detects what its fixtures
exercise — when a known legacy defect is diagnosed, pin its shape THEN, not
at fix time.

### 5.2 Port order

Each port: pin the surface's CURRENT output as a golden first → swap to
`querySpend` (+ real lineage via 5.0.1) → shadow-diff on a real org (5.0.4) →
run legacy budget suites + full validation gate → flag the expected
number-moves to product where visible.

1. **Budget chart** — ✅ BUILT ON-BRANCH (5.2.1–5.2.3 + item 7): the overview
   renders `SpendOverview` (method dropdown → cards + chart) off
   `/api/v2/spend`. Legacy Renewals/TCV chart views are NOT carried over
   (recorded at the compare page; revisit if product asks). Final flip gate:
   product review + legacy budget suites + delete the compare page.
2. **Monthly report** — ✅ PORTED ON-BRANCH (5.2.4, 2026-07-30): transforms +
   service on `buildMonthlyValuesByContract`, asOf injected, decision-#13
   grouping live, duplicate billing walk + dead legacy transforms deleted.
   Remaining: real-org shadow-diff attribution (see 5.2.4).
3. **Budget overview totals / table + dashboard widgets** — ✅ current/projected
   BUILT ON-BRANCH via `enrichWithEngineSpend` (5.2.2, semantics finalized in
   5.2.3 item 7); every `getUSDValue`/`computeContractBudgetValues` consumer
   moved with it. TCV deliberately NOT ported (windowless scalar — needs its
   own decision). **Dashboard card flipped too (2026-07-30, user request for
   the product eyeball):** `BudgetSection` now renders
   `DashboardSpendOverview` (`components/dashboard/DashboardSpendOverview.tsx`,
   client) — the cost-method selector sits in the Spend Overview title row
   (via a new optional `headerAction` slot on `ReportCard`) and ONE method
   state drives the current/projected summary cards AND the chart, same
   principle as the budget overview. Current/projected card values are now
   client-fetched from `/api/v2/spend` per method (they skeleton on load and
   method switch); the TCV card stays the server-computed legacy scalar
   (method-independent, unported by decision). The legacy `PriceHistoryChart`
   is gone from the dashboard but the component stays — the
   price-history-legacy page and the compare page still render it.
4. **MCP tools** (`get_spend`, `get_spend_breakdown`, `get_price_history`,
   renewals/vendors/contracts narration) — chat tools ride the MCP
   auto-adapter for free. RESOLVE HERE: FY-straddle behavior.
5. **Exports** — ✅ PORTED ON-BRANCH (5.2.6, 2026-07-30): budget-chart
   workbook on the engine (one sheet per psk-1844 method, chart-query
   parity), monthly-report XLSX verified engine-fed and formatter-pinned,
   duplicate actual-cost script deleted. See §5.2.6 for the recorded
   leftovers that are NOT spend-value exports (decoder-consolidation and
   row-transform consumers).
6. **Calendar + `lib/v2/core/filters.ts` range filters** (may slip to phase 7
   with the cached-field cleanup).
7. **Price-history page** — ✅ PORTED ON-BRANCH (5.2.5, 2026-07-30; pulled
   forward at the user's request): `lib/v2/reports/price-history/summary.ts`
   reimplements `buildVendorPriceSummaries` on the engine with psk-1844's
   method selector; the legacy module + max-mode private path are deleted.
   See §5.2.5 for the findings (a legacy invoice-cutoff BUG, a sliceActual
   conservation BUG, the recognition question for Phil).

Each surface picks its own `includeInactive` policy at the fetcher layer
(price-history page + MCP get_price_history include archived; others exclude).
Full consumer inventory with test coverage: design doc appendix.

### 5.2.4 Monthly-report port (2026-07-30 — PORTED; prep + port sessions)

**Port session (2026-07-30, later) — task-list item 4 DONE, item 5 docs/suites
done, shadow-diff harness below:**

1. **`lib/v2/reports/monthly-report/engine.ts` (new)** —
   `buildMonthlyValuesByContract(enriched, relationships, fiscalConfig, asOf)`:
   ONE half-open window `[start of asOf's month, start of month after next)`
   at month granularity, `groupBy:'contract'`, real lineage via
   `buildSpendLineageFromEnriched`, one `querySpend` per basis with a
   per-contract memoized resolver (both bases share the horizon → one
   resolution per contract). Returns `{amortized, actual}` maps of
   `{currentMonth, nextMonth, change}` + the two month keys. The legacy
   current-vs-projected-FY straddle branching is gone entirely.
2. **`transforms.ts` rewritten** — all four sections consume the engine values
   map; sponsor/group tables share one `buildSpendByDimension` using the
   engine's own `parseSponsors`/`parseGroups`/`splitEvenly`/`toCents`
   (per-add cents rounding, so dimension totals reconcile with engine
   `groupBy:'sponsor'/'group'` output exactly). `detectPriceChangeReason`
   takes asOf. Display seam: engine key 'unassigned' → label 'Unassigned'.
   `shouldExcludeFromAggregations` is GONE from the report — supersession now
   follows the resolver's zero-at-cutoff model; fully superseded contracts
   fall out via the 0/0 zero-skip instead of a pre-filter. (Consequence: a
   vendor whose only contract is fully superseded can now show a $0 row in
   topVendors — legacy pre-filtered it. Cosmetic; flag if product notices.)
3. **`service.ts`** — `getMonthlyReportData(alertRange, userMetadata, asOf =
new Date())`: asOf injected at the boundary, threaded through
   `adjustContractsForMonthlyReport` (given an asOf param — the one legacy
   file touch), `getFiscalYearInfo`, the engine values, and both
   `buildReportData` passes. Fetch/filter chain unchanged (published +
   hideFailed → filterLinkedChildInvoices → adjust → enrich); enrichment kept
   for display metadata + the returned `priceHistories`/`enrichedContracts`
   (still clock-dependent internally — they feed display/export only; the
   exports port owns that). The date adjustment is a no-op for engine math
   (resolver anchors on the EARLIEST term entry; strip-newest can't change
   it) but keeps the returned display rows and the MCP description honest.
4. **Legacy deletion** — `monthlyReportTransformers.ts` 940 → 82 lines: only
   `adjustContractsForMonthlyReport` survives. The duplicate billing walk
   (`extractActualCostPriceChanges`), legacy `transformToPriceChanges` /
   `transformToSpendByBusinessSponsor` / `transformToTopVendorsBySpend`, and
   the four type interfaces are deleted; the four UI importers
   (MonthlyReportClient, MonthlyReportTables, ExportMonthlyReportButton,
   export-monthly-report action) retarget types to the v2 transforms module.
   `spend-goldens.test.ts` section 3 + the `priceChangesActual*` golden keys
   removed (deliberate regeneration — diff verified key-removal-only);
   `asOf-determinism.test.ts` drops its legacy-transform case.
5. **Verification** — monthly-report goldens regenerated; the reviewed diff
   showed EXACTLY the decision-#13 move (ScalarGroup 'Unassigned'→'Research',
   totals −2000, ids renumbered) and NOTHING else: every other number,
   including float artifacts, is byte-identical to legacy on the six
   fixtures. `monthly-report.test.ts` rewritten for the new API (18 tests;
   3 mutations tried, all caught: swapped month buckets, naive division,
   group-reads-sponsor-source). Full main suite 148/1722 green, tsc clean.
   NOTE the unit tests can't catch a service-level lineage-wiring regression
   (passing EMPTY_LINEAGE would only surface on real amended data) — that is
   what the shadow-diff below is for.

**Prep session (2026-07-30, earlier):**

1. **Decision #13 implemented** — `groupBy:'group'` = repo-wide convention
   (direct + folder-inherited ACL groups via `extractBusinessGroups`, scalar
   `business_group` fallback, even split). `parseGroups` in
   `lib/v2/spend/grouping.ts`; both pipelines (querySpend + event queries) and
   the route enum opened; the three old throw-pinning gates updated. Tests:
   `spend-group-by-group.test.ts` (7, mutation-tested on the scalar fallback).
2. **Goldens pinned** — `monthly-report-goldens.test.ts` +
   `__goldens__/monthly-report-goldens.json`: all four v2 transforms × both
   view modes over SIX RAW-ROW fixtures under the 2026-07-15 clock, price
   history generated by the live minimal-mode path. Fixtures were chosen for
   the diffs the port will surface: multi-sponsor float split (engine is
   cents-preserving — expect cent diffs), scalar-group contract pinned INSIDE
   'Unassigned' (moves to 'Research' under #13), direct-ACL group,
   FY-straddling Nov-start auto-renewer (leading-gap shape), Aug-renewal at
   +20% (price-change row), will-not-renew. `UPDATE_GOLDENS=1` regenerates —
   the post-port diff is the review artifact.

**Survey facts the port session needs (subagent report not otherwise
preserved):**

- Port target: `lib/v2/reports/monthly-report/{service,transforms}.ts`.
  `transforms.ts` calls `extractAmortizedData`/`extractActualCostData` PER
  CONTRACT over the cached minimal-mode `priceHistory` (`getMonthlyValues`,
  transforms.ts:78–198) — 4 sections × 2 views × N contracts. The v2 module
  DROPPED asOf (`new Date()` inline at transforms.ts:82,152; nothing accepts
  an asOf — why its own tests can't freeze a clock). The port restores
  determinism via the engine's required `asOf`.
- Entry point: `getMonthlyReportData` (service.ts:55). Consumers: the
  budget/monthly-report page (`server-components.tsx:15`) and MCP
  `get_spend_breakdown` (`app/lib/mcp/tools/cpm/spend.ts:309` — its
  description promises it mirrors the in-app report EXACTLY, so they must
  move together). `buildReportData` (service.ts:160) runs the transforms
  twice (amortized/actual); `overview` is derived by summing sponsor rows.
- The CLIENT re-derives everything on tag filter from `subRows`
  (`MonthlyReportClient` filteredSpendByBusinessSponsor/Group/overview) —
  per-contract subRow data must survive the port. Assemble sponsor/group
  tables from per-contract engine values using the exported
  `parseSponsors`/`parseGroups`/`splitEvenly` so table totals reconcile with
  engine `groupBy:'sponsor'/'group'` output by construction.
- Engine mapping sketch: per basis, ONE `querySpend` over an arbitrary
  `{from: currentMonthStart, to: end of next month}` window at month
  granularity, `groupBy:'contract'`; the two month buckets give
  currentMonth/nextMonth per contract; priceChanges = their delta;
  topVendors = vendor rollup. Arbitrary windows kill the legacy
  current/projected-FY-view hack entirely.
- LEGACY `monthlyReportTransformers.ts` (937 lines): only
  `adjustContractsForMonthlyReport` (:75) + four type aliases are live in
  production. `transformToSpendByBusinessSponsor` and
  `transformToTopVendorsBySpend` are fully dead;
  `transformToPriceChanges` + the `extractActualCostPriceChanges` walk (:540)
  are reachable ONLY from spend-goldens/asOf-determinism tests — deleting the
  walk changes no production output, it only invalidates the
  `priceChangesActual*` golden keys (regenerate deliberately at deletion).
  UI files import types from BOTH the legacy and v2 files
  (MonthlyReportClient, ExportMonthlyReportButton, export-monthly-report) —
  retarget the type imports at the port.
- Known naming seam: the report displays 'Unassigned', the engine keys
  'unassigned' — map at the transform layer, decide nothing.
- Guard set for this surface: add `monthly-report`,
  `monthly-report-goldens` to the jest patterns (the `spend` pattern does
  not match them).

**Shadow-diff run (Berenberg, 2026-07-30, read-only,
`scripts/monthly-report-shadow-diff.ts`) — EVERY delta attributed:**

- **Decision #11 (invoices never project) is the whole story minus one
  contract.** 18 of 19 amortized movers and all 14 actual movers are
  `type_id 6` Invoices legacy phantom-annualizes into Jul/Aug 2026: the 14
  WM Datenservice invoices (the §5.2.2 data-defect set — once the user fixes
  the `active: null` rels + archives the orphans they filter out of BOTH
  sides), FactSet #3000 (the documented #11 reversal), and NEWLY SEEN Warsaw
  Stock Exchange #3124 (a 2024 full-year invoice!) / #3125 / LSE #3136 (2025
  invoices) — same shape, verified `type_id 6` via read-only query. Legacy
  actual current-month total $2.64M vs engine $358k is this phantom
  annualization; the report's numbers drop dramatically at the flip for
  invoice-heavy orgs. FLAG WITH PRODUCT alongside the §5.2.2 data
  conversation (it is the same accepted #11 cost: forward under-reporting
  until the next invoice is recorded).
- **JPM #3040** (3,333 → 1,667 both months): the recorded §5.1 mid-term
  amendment truncate+scale. (Script caveat: its legacy side skips
  enrichWithEffectiveFees, so legacy shows the raw 3,333 where production
  legacy shows the replaced fee — bucket attribution unaffected.)
- **Decision-#13 group moves: none at Berenberg** (no scalar-only /
  folder-inherited-only contracts there — the goldens carry that behavior).

**Remaining for this surface:** flip gate only — this surface flips with the
service (no separate feature flag); it ships whenever the branch does. The
Berenberg data fixes (§5.2.2 NEXT) remain the user's item and are
independent of this port.

### 5.2.5 Price-history port (2026-07-30, later session — pulled forward at the user's request)

**Built (all on-branch):**

1. **`lib/v2/reports/price-history/summary.ts`** — `buildVendorPriceSummaries`
   reimplemented on the engine, same exported interface: ONE per-product query
   at fiscal-year granularity over `[1970, FY(targetYear) end)` with real
   lineage replaces max-mode generation + `truncateSupersededAtChildStart` +
   `distributeFeeAcrossYears`. Renewal % and year statuses derive from the
   memoized segments (active cycle vs successor — reproduces legacy exactly,
   goldens byte-identical for the unaffected shapes); ACV stays the cached
   enrichment scalar; year labels are bare FY numbers (identical display for
   January orgs, decision-#7 numbering otherwise).
2. **psk-1844 method selector** (the ticket's price-history bullet, read
   2026-07-30): `method: 'amortized'|'actual'|'committed'` param; the page
   precomputes ALL THREE server-side (memoized resolver per call) and
   `components/budget/PriceHistoryView.tsx` (client) swaps them via
   `CostMethodSelect`. `defaultMethod` hardcoded until psk-1877.
   **RECOGNITION FLAG — RESOLVED 2026-08-04:** Contract Term here is
   START-dated (`recognition:'term-start'`, the ticket's literal wording),
   and the overview CONVERGED to it when the provisional cancel-by dating
   was reverted (product decision — see the CURRENT STATE bullet). Both
   surfaces now agree; the doubling examples recorded here (Bloomberg 2023
   288k vs 144k, ICE 2026 117k) were exactly what product flagged on the
   overview. ALSO FLAG (still open): the ticket's "individual
   contract and product rows as-is" note — on price history the method is
   applied at ALL levels (vendor/product/contract) so rows still sum;
   confirm that reading.
3. **`sliceActual` conservation BUG found and fixed (`SPEND_ENGINE_VERSION`
   → 5).** `fee/spanMonths × billingMonths` over-billed any segment SHORTER
   than its billing interval (a truncated 6-month segment with annual
   billing billed 2× its fee) — invariant 2 violated. Unreachable in legacy
   (whole-period zeroing, no partial segments); reachable since phase 4's
   truncate+day-scale, LIVE on the overview/monthly-report Actual views for
   mid-cycle-amended contracts. Fix: each bill's coverage caps at the
   segment end. New invariant cases (sub-interval, annual + quarterly) in
   `spend-engine-invariants.test.ts`, mutation-verified.
4. **LEGACY PAGE BUG found (engine fixes it): invoice children truncate
   their parent's price history.** Legacy `buildCutoffsByContract` rebuilt
   product families from raw membership, so linked INVOICES (same product
   ids, later starts) cut their parents — the live page zeroes ICE #3047's
   recorded years 2/3 at its first quarterly invoice (#3052–60), and
   likewise JPM #3040, Fitch #3012, Euronext #2948 (per-product mix), S&P.
   The engine's members builder drops linked child invoices (invoices never
   supersede), restoring full trajectories. HUGE eyeball-visible move UP
   for invoice-billed vendors (ICE 2026: 5,000 → 61,044).
5. **Shadow-diff (`scripts/price-history-shadow-diff.ts`, Berenberg,
   read-only) — every delta attributed:** the invoice-cutoff bug above
   (dominant), the recorded #3038→#3040 truncate+day-scale (2,541
   remainders visible), Moody's #3017 phantom now showing (its legacy
   cutoff came from orphaned invoice #3020 — same bug class), WM ±990
   residual (straddle rounding). The legacy oracle is materialized from git
   history into UNTRACKED `scripts/.legacy-price-history-summary.ts`
   (regeneration command in the script header).
6. **Deletions/retargets:** `app/lib/budget/priceHistorySummary.ts` deleted
   (637 lines); page (debug-snapshot helper removed too), MCP
   `get_price_history` (rides along — relationships threaded via
   `loadPriceHistoryContext` reuse and `getActiveAndArchivedContracts` now
   returning its relationships), `VendorPriceTable` types retargeted.
   `spend-goldens` dropped its `distribute`/`buildVendorPriceSummaries`
   captures; the spend-lineage parity test became a literal boundary pin.
7. **Gates:** `price-history-goldens.test.ts` pins all three methods over
   seven fixtures (amendment chain, #9 shape, multi-year, archived,
   renewal %, 18-month stub, standalone invoice); the legacy→engine diff
   was captured and reviewed (straddle scale 10,000→4,958.90, #9 gap fill,
   statuses truer to asOf; everything else byte-identical). Mutations:
   renewal-next + year-label caught; status-merge order NOT covered
   (fixtures lack competing statuses in one vendor-year — recorded gap).

### 5.2.6 Exports port (2026-07-30, exports session)

**Built (all on-branch):**

1. **Budget-chart export on the engine** —
   `lib/v2/reports/budget-export/engine.ts` (`buildBudgetExportValues`):
   issues the CHART'S exact queries (month granularity, groupBy contract,
   currentFY + nextFY) over the chart's exact inclusion chain
   (`filterForAggregation ∘ filterToBudgetContracts`, lineage over the full
   enriched set, per-contract+horizon resolver memo), so every workbook cell
   matches the chart. Sheets are the psk-1844 methods — Amortized | Actual
   Cost | Contract Term (labels from `costMethodLabels`) — replacing legacy
   Renewals | Actual Cost | Amortized. Contract Term is the SAME
   recognized-commitments query as the cards/chart/table stamps
   (`valuation:'annual'`, `recognition:'cancel-by'`); the
   `spend-cost-methods` lockstep pin now covers it (change one, change all
   FOUR), and the item-7 provisional revert is now one line in FIVE places:
   `costMethodInput`, `enrich.ts`, `budget-export/engine.ts`, and the two
   harness scripts.
2. **Action + wiring** — `exportBudgetChartData()` takes NO params (org
   fiscal config and inclusion are server-derived; the client-supplied
   contract-id list is gone). `SpendChart`'s export handler simplified; the
   `fiscalYearStartMonth` prop chain into SpendChart/SpendOverview/
   DashboardSpendOverview/BudgetSection was orphaned by this and removed.
   The caller-less `ExportBudgetButton` (dead since the SpendChart flip) is
   DELETED. The legacy `PriceHistoryChart`'s export button now downloads the
   canonical engine workbook (that component survives only on
   price-history-legacy + spend-compare, both slated for deletion).
3. **Goldens** — `budget-export-goldens` pinned the LEGACY assembly first
   (the action's real pipeline: `generatePriceHistories` FULL mode →
   `extractChartData` both FYs), then regenerated on the engine; the
   reviewed diff was EXACTLY the recorded decisions: #11 invoice
   no-projection (amortized/actual), float-tail cents cleanup, and the
   Renewals→Contract Term sheet replacement (initial-term commitments in,
   offset renewals dated at their deadline — the 90-day fixture moves
   2027-03 → 2026-12 — Dec term-end events shifted to Jan term starts).
   NOTE: the legacy EXPORT had no minimal-mode leading gap to fix — unlike
   the chart it regenerated FULL-mode histories, so amortized/actual were
   otherwise byte-identical. Mutation-tested (recognition flip caught by
   both the lockstep test and the golden).
4. **Monthly-report XLSX** — NO port needed: `exportMonthlyReportExcel` is a
   pure formatter over the props the page renders (engine transforms since
   5.2.4, tag-filter included), so it matches the page by construction.
   Pinned `monthly-report-export-goldens` (workbook cells, both view modes,
   frozen clock with Date-only fake timers so ExcelJS streams run). The
   Upcoming Renewals sheet reads `currentBudget`/`projectedBudget` off
   `buildContractTableRow` rows — LEGACY values, but identical to what the
   page's own renewals table shows. Flips when the row transform flips,
   which is gated on the psk-1844 "individual rows" question for Phil (the
   5.2.2 claim that the table columns moved was wrong at row level — see
   the correction note below).
5. **Scripts** — `exportActualCostsByCcDate.ts` DELETED: byte-identical to
   `exportActualCosts.ts` except import style (the design's convention #6
   "cc-date variant" no longer existed). The surviving script stays a
   legacy-pipeline consumer; port-or-delete it with phase-7 legacy deletion.

**Recorded, deliberately NOT ported here (not spend-value exports):**

- `exportInvoiceFolderCSV` (`export-report.ts`) and the contract action's
  products-by-year grouping (`app/lib/actions/contract.ts` ~:293) both use
  `generatePriceHistory('minimal')` + `extractBudgetFromPriceHistory` for
  products-by-CONTRACT-YEAR display — year-index decoder consumers, §5.3
  decoder-consolidation scope, not spend math.
- `exportReportCSV` serializes table rows (`generateContractData` /
  transform output) — its Current/Projected Spend columns show whatever the
  TABLE rows show and must move WITH the row transform, not separately.

**CORRECTION to §5.2.3 item 7's wording (verified this session) — SINCE
RESOLVED:** at the time, `buildContractTableRow` was untouched and per-ROW
`currentBudget`/`projectedBudget` were still legacy
`extractBudgetFromPriceHistory` values; the engine stamps flowed only
through the totals primitives. **The row flip landed 2026-08-04** (see the
CURRENT STATE bullet): rows now prefer the engine stamps in native
currency, with legacy fallback for unstamped paths — the psk-1844
"individual rows" flag was resolved by product's own review feedback.

### Derivation-cache staleness incident (2026-07-30 evening — found via the export, FIXED)

The freshly-ported export workbook disagreed with the overview cards by
~0.5% on every non-USD contract (amortized FY26: workbook 2,064,413 vs
cards 2,056,966), stably, across Redis flush attempts. Instrumented
fingerprints proved both surfaces received IDENTICAL fee inputs while the
route returned totals consistent with an OLDER EUR/PLN rate: the
derivation cache was serving segments whose baked-in fees predated an
intraday FX refresh. Root cause: `buildComponentSignatures` hashed only
member `updated_at` + edges, but the fees the resolver reads change
WITHOUT any row edit — `convertedFees` is re-stamped by currency
conversion at contract-set cache fill, and product-fee rows live in their
own table. So a rate refresh (or product-fee edit) left every cached
entry key-valid but content-wrong for the rest of the asOf-day. The
export resolves fresh (no store), which is why it alone was current —
the deliberate asymmetry that surfaced the bug.

Fix: `feeDigestOf` (derivationKey.ts) digests each contract's per-product
`convertedFees ?? fees` and participates in the component signature via
`ComponentMember.feeDigest`; the route stamps it. Any fee-input change now
rotates the key and stale entries orphan (no version bump — resolver
behavior unchanged; TTL reclaims orphans). Gates in
`spend-derivation-key.test.ts` (fee change under unchanged updated_at
rotates the whole component; digest prefers convertedFees, order-stable;
mutation-verified). User-verified on prod data: cards now match the
workbook exactly.

Ops notes from the chase: ElastiCache cluster-mode `redis-cli --scan`
walks ONE shard — targeted key deletion can silently miss; the
`user:<id>:spend:seg:*` prefix comes from the route's user-scoped store.
Related hardening still open: `getExchangeRates` falls back to 1:1 rates
on ANY failure with only an error log — deserves a `logAlert` code
(non-USD books silently deflate to native numbers). The psk-1796 part-B
move of conversion out of the fetch path removes this class entirely.

### 5.2.7 Invoice window-relevance rule (2026-08-03 — design decision #14)

An invoice (`type_id` 6) participates in a query only when the LATER of its
invoice date (`execution_date`) and latest billing-period end
(`term_end_date`) reaches the window start — either date alone misjudges
up-front billing for a future period and arrears billing (the typical case).
Full rationale in the design doc decision log (#14).

**Where it lives:** `lib/v2/spend/invoiceRelevance.ts`
(`invoiceActivityDate` / `isStaleInvoice` / row-level
`excludeStaleInvoices`), applied INSIDE `querySpend` and `runEventQuery` —
window-relative, so the price-history page's from-1970 windows keep their
invoice series (the 5.2.5 restoration is untouched) while currentFY/nextFY
queries shed old invoices. The lenient date parser is the resolver's own
`toIsoDate` (now exported), so relevance and resolution read dates
identically. No `SPEND_ENGINE_VERSION` bump: segments are unchanged;
inclusion happens outside the cached derivation.

**Row/totals surfaces (cutoff = current-FY start via `resolveWindow`):**

- `getBudgetContracts` — stale invoice ROWS leave the budget Spend table.
  NOTE this also feeds MCP `get_spend` (legacy extractors), so its numbers
  drop for stale-invoice orgs ahead of the 5.2-item-4 port — same accepted
  direction as decision #11's phantom-annualization removal.
- `buildBudgetSummary({ staleInvoiceCutoff })` — dashboard tcv/current/
  projected + topVendors' priceHistories. Contract/vendor COUNTS
  deliberately unaffected. Callers omitting the option get legacy behavior:
  the spend-compare page's legacy side stays unfiltered BY DESIGN (it pins
  legacy output for comparison).
- `budget-export/engine.ts` — `kept` drops stale-invoice rows so the
  workbook row set matches the table (their cells were already zero via the
  engine-side rule).

**Numeric reality check:** for well-dated invoices this is mostly a display/
row-set change — out-of-window segments never contributed to forward
windows. The genuine engine moves: a no-end-date invoice (resolver defaults
a 12-month span) no longer smears into the current FY when its invoice date
is past, and legacy scalar totals (TCV fallbacks) stop counting stale
invoices. An invoice with NO parseable date is never excluded.

**Gate:** `__tests__/v2/spend-invoice-relevance.test.ts` (18 tests) —
later-of pins both directions (arrears / charged-up-front), latest-of-many
term ends, boundary (activity == window start kept), invoice-only scope,
window-relativity (historical FY keeps it), both pipelines
(querySpend + queryCommitments), summary cutoff on/off. Mutation-tested:
five mutations (skip removed in each pipeline, earliest-date flip, type
guard removed, boundary `<=`) all caught. Beware the recorded gotcha —
restoring a mutation via `git checkout` reverts uncommitted work; restore
from a scratch copy instead (bitten again this session).

### 2026-08-03 product-review audit — three findings, zero engine bugs

Product reviewed the overview chart + export workbook; every number was
reproduced from raw prod rows (read-only; disposable harness
`scripts/audit-review-findings.ts`, untracked).

1. **Chart vs export deviation on non-USD contracts (Euronext #2948,
   Jan-26: chart 19,198 vs export 19,217.33).** FX VINTAGE, not math: the
   native fee is €199,929/yr; four observed values (those two plus the
   Jul-30 exports' 19,211.67 and Aug-3 exports' 19,181.02) imply EUR/USD
   1.15127–1.15345 — each artifact internally exact (Contract Term ÷ 12 to
   the cent). Rates come from currencyapi with a 6-hour Redis TTL and are
   baked into `convertedFees` at contract-set cache fill, so any two
   renders hours apart can differ ~0.2%. Same-instant chart + export DO
   match (the 5.2.6 feeDigest fix covers the derivation cache). Permanent
   fix = psk-1796 part B (currency-keyed cache / pinned historical rates).
2. **"Amortized for 3040/3038/3024 should start later in the year."**
   Amortized is continuous service cost, and all three are mid-service in
   January: #3038 (Apr-16 anniversary, parent-term-inherited 12-month
   cycles) has Jan–Mar covered by its Apr-2025 cycle — the recorded §5.1
   leading-gap CORRECTNESS fix (legacy printed $0 there); #3040's cycles
   run Jan-14→Jan-14 (earliest term entry 2019-01-14), so January is
   in-cycle; #3024 signed Jul-2025×36mo — Jan–Jun 2026 is contract-year-1
   service. Reverting to legacy's cycle-start-only display would be a
   product decision to un-fix the leading gap — bring to Phil if pressed.
3. **"Amortized ≠ Contract Term ÷ 12 (ICE/JPM/S&P)."** Product compared
   the VENDOR ROLLUP rows' Jan column (their screenshots reproduce from
   the current workbook to the cent; only EUR/PLN cells drift per finding
   1). The division itself is exact everywhere — the mismatch is
   membership: a vendor's Jan CT cell holds only the contracts whose
   commitment lands in January, while Jan Amortized holds EVERY active
   contract's monthly share. JPM 15,625.00 = #3039 6,249.99 (CT Jan
   75,000) + #3038 7,708.35 (CT Apr) + #3040 1,666.66 (CT Dec, cancel-by
   deadline); ICE 5,087.01 = #3047 4,670.34 (= 56,044/12) + #3048 416.67
   (CT Oct); S&P 18,953.08 with CT Jan $0 because #3024 commits in July
   (mid-service straddle). WM additionally breaks ÷12 because its
   half-year invoices amortize over 6 months. ÷12 holds only where the
   whole vendor book commits in January — exactly Euronext and Warsaw,
   product's two "working" rows. The Dec/Oct deadline entries were the
   provisional cancel-by recognition confusing its first real reviewer;
   product's follow-up ("the ICE October cell shouldn't affect the spend
   calc") settled it — recognition flipped to term-start on 2026-08-04
   (see the CURRENT STATE bullet), which also removes those entries.
   Follow-up verified on Fitch #3006 (its Jan-2027 CT entry with a BLANK
   Cancel By column): the offset was the parent MSA #3005's 30-day notice,
   inherited by the engine via `buildParentNoticeDays` while the export's
   Cancel By column shows only the contract's own date — a real
   display-vs-engine asymmetry, mooted for these surfaces by the
   term-start flip (recognition no longer reads notice periods).

### 5.2.8 Fiscal-year selector (2026-08-04, evening session)

The overview can now show ANY fiscal year back to the oldest contract date;
default stays the current FY. User decisions locked this session: **archived
contracts are included in historical years** (a contract archived since then
was real spend that year); **rows filter to contracts that contributed spend
to the selected year** (any resolved segment overlapping the FY window, so
multi-year deals stay visible through their tail year, plus the decision-#14
invoice-relevance rule at the selected FY start); **the selector stops at the
current FY**; the selector **replaces the header's static "Fiscal Year
(Edit)" block** and sits beside `CostMethodSelect`. Product request, same
session: the historical year appears as **its own tile BEFORE Current
Estimated Spend** — the Current/Projected cards stay ANCHORED to today's
FYs as reference points (this superseded the earlier plan to re-window
them). A one-line model disclosure shows for historical years ("modeled from
contract terms — invoice-based actuals are not recorded yet").

**Engine (`lib/v2/spend/enrich.ts`)** — `buildEngineSpendByContract` /
`enrichWithEngineSpend` take `EngineSpendOptions`:

- `windows: {current, projected}` (default `currentFY`/`nextFY`, so the
  fetch-boundary stamps are byte-identical to before) — the historical path
  passes `{fiscalYear: y}` / `{fiscalYear: y+1}`.
- `cycleDates: true` adds per-contract `cycle: EngineCycleDates`
  (`termStart`/`termEnd`/`cancelBy`) + `activeInWindow`. This answers the
  feature's two hard problems: term arrays only record SOME years (uploads
  hold the initial term, in-app renewals the current one), and
  `cancel_by_date` is a day OFFSET — so historical dates must be GENERATED.
  The resolver already generates every cycle; the stamp picks the term in
  force on the window's last day (falling back to the final term overlapping
  the window), grouped by the `termStart` stamp so a multi-year deal reports
  its whole RECORDED span, not the engine's internal 12-month slices.
  `cancelBy` = term end − `cancelByOffsetDays` (now exported from
  queryEvents — includes the psk-1855 MSA notice inheritance), null when no
  offset exists: a RECORDED `cancel_date` belongs to the current recorded
  term and is deliberately not shown against a historical cycle. Stale
  invoices stamp `{cycle: null, activeInWindow: false}`. Resolution cost:
  zero extra — cycle facts read the same memoized segments as the USD query.
  NO `SPEND_ENGINE_VERSION` bump (segments unchanged; stamps live outside
  the cached derivation).

**Service (`lib/v2/contracts/service.ts`)** — `getBudgetContracts(fiscalYear?)`:
default/current-FY path unchanged (cached stamps, legacy row dates);
historical path = `getActiveAndArchivedContracts()` (un-Redis-cached archived
fetch, accepted cost) → windowed stamps with `cycleDates` → filter to
`activeInWindow`. `getEnrichedContracts` gained a third positional
`includeArchived` (archived merged BEFORE lineage, per
getActiveAndArchivedContracts' cross-status supersession rule).
`getOldestContractFiscalYear()` = light org-scoped service-role read over
published+inactive rows, gated to rows the budget pipeline can actually
surface (pure `oldestBudgetFiscalYear`: non-failed extraction, has vendor,
positive raw fee sum with the budget filter's lenient parse, parseable
earliest start) — an ungated first cut offered FY2007 off a zero-fee shell
and rendered an empty page (user-caught same session; gate:
`budget-fy-range.test.ts`, 6, fee-gate mutation caught). Role scoping is
deliberately skipped — it exposes only a year number. Residual honesty note:
a GENUINE gap year between two contract eras still renders an empty state
(continuous range by design), and a fee-bearing old contract dropped later
in the pipeline (ACL, linked-child invoice) can still widen the range.

**Rows (`lib/v2/contracts/transforms.ts`)** — `buildContractTableRow` prefers
`engineSpend.cycle` for termStartDate/termEndDate/cancelByDate; vendor-group
rollups inherit automatically (they read row values). The
`cancelByDateInherited` tooltip metadata stays the legacy derivation — its
copy is date-independent, but an engine-inherited offset without legacy
metadata shows a bare date (cosmetic, recorded).

**Route (`app/api/v2/handlers/spend/query.ts`)** — a window resolving to a
past FY (`resolved.fyNum < currentFY`) fetches archived, so cards/chart/table
query the same population. NOTE `{from,to}` ranges starting in a past FY now
include archived too — no current caller sends one (the price-history page
has its own service path).

**UI** — `fy` URL param (nuqs `parseAsInteger`, `shallow: false` so the RSC
re-renders the table; cleared when re-selecting the current year);
`FiscalYearSelect` (new, `components/budget/FiscalYearSelect.tsx`);
`SpendOverview` owns the year and clamps against `[oldestFY, currentFY]`
(server clamps identically before fetching); `SpendChart` FY props are
OPTIONAL — the dashboard renders it unchanged; `useSpendQuery` gained
`{enabled}` for the conditional historical-tile query.

**Export** — `exportBudgetChartData(fiscalYear?)`: a genuinely historical
year (validated server-side against the org's current FY) exports
`[FY, FY+1]` sheets over the historical row set (archived in, rows filtered
by the same segment-overlap rule via the warm resolver memo); filename gains
`fy${y}`. `buildBudgetExportValues` takes the optional year; default calls
are byte-identical (goldens untouched).

**Gates (all mutation-tested):** `spend-enrich.test.ts` 18 (windows override
×2 mutations, termStart-vs-from grouping, cancel-by off-by-one, stale-guard
removal — all caught), `contract-transforms.test.ts` 17 (cycle-date
preference both directions), `spend-cost-methods.test.ts` 9 (historical
export windows + row filter — both mutations caught). Full suite
**154 / 1776**, tsc clean, lint clean except the recorded pdfjs noise,
touched files prettier-formatted.

**Known gaps / follow-ups (recorded, not blocking):**

- Historical renders pay the un-cached archived fetch + a full 4-pass stamp
  per view; fine at Berenberg scale, measure on the largest org if it drags.
- The historical tile always queries `{fiscalYear: y}` while the anchored
  cards keep the `'currentFY'`/`'nextFY'` literals — same population by
  construction (route includes archived only for PAST windows).
- Zero-fee shells: table keeps them for historical years (segments overlap
  at $0), the export's row filter keeps them too (same rule); the CHART
  drops zero-value events as before — consistent enough, revisit if noticed.
- psk-1877 (org default method) still pending; `defaultMethod` remains a
  hardcoded prop.

### 5.3 Fold in while porting (from the audit)

- **Decoder consolidation** (the unfinished phase-2 scope): port
  `calculateContractYear` / `productSelectionStrategy` / `getNextYearFees` /
  `lifetimeValueCalculator` onto the resolver as their consumers port — then
  revisit the `term_start_date[0]` (newest-not-earliest) bug-for-bug port in
  `totalAnnualIncreases`.
- **Coverage gaps** to close with phase-5 fixtures: `hasFeeOverrides`
  suppression, `annual_increase_months`, multi-entry term arrays,
  non-January fiscal for amortized/actual.
- Deprecate legacy extractors (`@deprecated → querySpend`) only once their
  last consumer has ported.

## Phase 6 / 7

### Collapse `queryEvents` into `querySpend` (proposed 2026-07-29)

`queryEvents.ts` is 375 lines against `querySpend.ts`'s 184 — the sibling is
twice the size of the thing it is a sibling to. `grouping.ts` already shares the
leaf helpers (`resolveWindow`, `createLineItemAccumulator`, `parseSponsors`,
`splitEvenly`); what is still forked is the PIPELINE SHAPE — `runEventQuery`
re-implements resolve → place → group → accumulate alongside querySpend's body.

The three "different questions" differ along only two dimensions:

- **unit** — is a line item one segment, or a whole term (segments sharing a
  `termStart`, summed)?
- **date policy** — for a point value: segment start / term start / term end /
  action date.

plus a filter that already exists implicitly (all / recorded / projected).

| view                 | unit    | date                                         | include   |
| -------------------- | ------- | -------------------------------------------- | --------- |
| amortized            | segment | spread across span                           | all       |
| actual               | segment | billing dates                                | all       |
| committed            | segment | segment start                                | all       |
| renewals             | term    | term start                                   | projected |
| TCV                  | term    | term end                                     | recorded  |
| commitments · annual | segment | segment start (+action on term-start slices) | all       |
| commitments · term   | term    | action                                       | all       |

Nothing there is a different KIND of query — it is `querySpend` with a unit and
a date the API does not expose. `kind` (new/renewal) is orthogonal: just
`segment.source` surfaced onto line items. Sketch:

```ts
querySpend(contracts, {
  basis: 'amortized' | 'actual' | 'point',
  point?: { unit: 'segment' | 'term', at: 'start' | 'end' | 'action' },
  include?: 'all' | 'recorded' | 'projected',
})
```

Keep `queryTCV` / `queryRenewals` / `queryCommitments` as three-line named
wrappers — call sites stay readable and decision #3's semantic distinction
survives; only the mechanical fork goes. Decision #3 argued these are different
questions that should not be crammed into the `basis` enum: still true, and
never an argument for a duplicate pipeline.

Do it HERE, not during phase 5: it churns the surface under product review,
every named query has mutation-tested gates that would need re-pointing, and it
would force a `SPEND_ENGINE_VERSION` bump for zero behavior change. Natural
pairing with `explain`, which wants one pipeline to instrument rather than two.

### Remaining phase 6 / 7 scope

Explain output (`explain:true`) — audit page (`stash@{0}`, see below) becomes
a thin renderer over it. Integrity report — surface `confidence:'inferred'` +
`reason` (the resolver already records tie-breaker / renewal-hint /
renewal-projection / renewalLengthDefault / annualFeeRepeat reasons; add the
**stale-unconfirmed flag** from the Berenberg sniff: "term ended >N months
ago, still unconfirmed, projecting renewals"). Wire or delete `classifyShape`
here (currently caller-less). Then delete legacy paths — NAMING which
cached-`priceHistory` readers keep the field vs port (calendar, filters,
narration were never spend surfaces). Move the weekly-alert Deno
`budgetCalculator.ts` fork server-side (its date-only `getTermLength` has the
PSK-1850 bug for multi-year alert emails today).

## Housekeeping / loose ends

**Leftover review findings (2026-07-29 full-branch review — recorded, not
fixed):**

- ~~Export button on the engine chart runs the LEGACY pipeline~~ — RESOLVED
  at the 5.2.6 exports port: the workbook now issues the chart's exact
  engine queries, one sheet per psk-1844 method.
- `SPEND_ENGINE_VERSION = 3` but the comment in `derivationKey.ts` documents
  only v2 — add the v3 line (invoices-never-project) on the next touch.
- `useSpendQuery` has no `staleTime`/`placeholderData`, so the summary cards
  skeleton-flash on window-refocus refetches (the isFetching skeleton is
  deliberate for method switches; the refocus flash is collateral).
- Nits: `SpendChart`'s FY-number arithmetic (subtract-then-add-back),
  `(props: any)` on the recharts shape props, `toCents` (in toChartData and
  the resolver) rounds to cents but returns dollars.
- `#1594 × annual_increase_months`: the hint-cycle compounding fix flows
  through the months branch untested (the §5.3 coverage gap, now with one
  more behavior on it).

- **The PSK-1850 audit page** (`app/(app)/(cpm)/budget/audit-psk-1850/`) still
  lives only in a stash — index `stash@{3}` as of 2026-07-29, but stash indices
  SHIFT whenever anything is pushed or popped, so find it by message
  (`git stash list | grep audit`) rather than trusting a number. It becomes the
  explain-renderer in phase 6. A bare stash is fragile — commit it to a wip
  branch.
- `scripts/spend-sniff.ts` is now TRACKED (f480bbc0). It reads `.env.prod`
  (read-only, service role); no secrets in the file itself.
- `spend-guidance.test.ts` is a pre-existing MCP test, not part of this work.
- Known environment noise (pre-existing, NOT this branch): full `npm test`
  picks up broken suites from `.claude/worktrees/` (the jest ignore pattern
  `\.worktrees/` doesn't match that path) and `npm run lint` fails on an
  untracked local `public/pdfjs/wasm/` asset. Zero real failures outside
  those; fix the jest pattern / eslint ignore if they get annoying.

## Gotchas, traps, and intentional divergences (read before phase 5)

- **Intentional divergences — do NOT "fix" these:** (a) #1594 renewal-hint
  differs from legacy's 24-month reading; the legacy golden still shows
  24-month — expected. (b) Decision #9 differs from legacy max mode
  (single-period) AND from legacy full's full-fee trailing stub (the
  acknowledged over-count) — the engine splits only clean 12-multiples.
  (c) Monthly proration is NOT cent-exact — conservation is exact only under
  `daily`; ≤½-cent-per-bucket monthly residual is by design. (d) Never
  hand-edit `spend-goldens.json` — regenerate via `UPDATE_GOLDENS=1` only for
  a deliberate, reviewed change. (e) Don't touch legacy `generatePriceHistory`
  / `app/lib/budget/*` — live until each consumer ports.
- **Berenberg sniff findings (2026-07-18, user-verified):** ICE #3047 and S&P
  #3024 correct; linked-invoice filter works (49 dropped). Standalone invoices
  annualizing via auto-renewal is CORRECT (FactSet #3000: 2-month invoice
  $88,243 → $352,972/FY2026 — real). Moody's #3017 phantom renewal (€637k) is
  domain-rule-correct but double-counts the vendor — #3017/#3014 have
  genuinely different products, NO lineage joins them; remedy = archive the
  old term + the phase-6 integrity flag, NOT lineage. Addendum #3038 (no end
  date): inherit parent's subscription_term, keep own fees (open question,
  implement at 5.0.1). Zeroed fee shells (#3015/#3062) are intentional CS
  practice; ignore until a stronger contract-package object exists. TOS
  parents are a data quirk — ignore.
- **Test scope at phase 5:** the guard set is the spend-engine SUBSET. When
  touching live paths also run the legacy budget suites (`budget`,
  `price-history`, `monthly-report`, `actual-cost-chart`,
  `invoice-discrepancy`) and the full validation gate (lint · prettier · tsc ·
  test) locally — CI only verifies generated Supabase types.
- **Environment:** work stays on `refactor/spend-engine` (PR target per
  AGENTS.md is `development`). husky reformats staged files on commit —
  beware: a `git checkout <file>` restore after mutation-testing reverts
  UNCOMMITTED edits too (bitten once this session; re-apply and re-run).
- **psk-1796 (base currency) interlock:** native-currency segments ship with
  psk-1796 part B (currency-keyed Redis cache + conversion move). Until then
  the engine consumes pre-converted USD; the sniff script sees NATIVE fees
  because it bypasses `convertAllProductsToUSD` — compare cadence, not FX.
