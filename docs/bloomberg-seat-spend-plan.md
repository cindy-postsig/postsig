# Bloomberg Seat Spend — Per-Month Pricing, Shared Seat Population, Assignments

Hand-off plan. Companion to `docs/bloomberg-sid-schema-design.md` (schema),
`docs/spend-engine-design.md` (engine) and `docs/cost-allocation-design.md`
(allocation). Written 2026-09-08 from the state of `development` plus PR #2260.

## 1. Outcome

Three surfaces show a Bloomberg terminal's cost, and today they mean three
different things:

| Surface                                   | Today                                                                                           | After                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `/vendors/[id]/inventory` Permissions tab | Report month's terminal price + exchange pro-rates, native USD                                  | Unchanged                                                                                                                            |
| `/reports/allocation-rollup` per user     | Latest report's rate applied to every month in the window, converted per month to base currency | Each month priced at the term in force that month plus that month's exchange charges; carry-back / carry-forward outside the imports |
| `/assignments` per user "Monthly"         | Bloomberg seats absent; contract seats are current-FY value ÷ 12                                | Bloomberg seats present; "Monthly" is the engine's bucket for one month, no ÷ 12                                                     |

When done, the Permissions tab figure converted to base currency equals the
assignments figure for that month, and the rollup's window total is the sum of
those months. No surface averages an annual number back down.

Worked example, seat SID 266891 / instance 5 ("user 492 ffm"), Berenberg (EUR base):

- April 2026 report: 2,360.00 + 51.10 (Cboe Europe L1) = 2,411.10 USD/month. Permissions tab shows 2,411.
- March 2026 report: 2,215.00 + 51.10 = 2,266.10. February: 2,215.00 + 52.00 = 2,267.00.
- Today's rollup for FY2026 = 2,411.10 × 12, converted month by month at the
  monthly-average USD→EUR rate (Oct–Dec at the latest rate) ≈ 24,893 EUR.
- The Feb and Mar reports show the seat's term ending 2026-04-07 at 2,215.00;
  the Apr report shows the next term, 2026-04-07 → 2028-04-07 at 2,360.00.
  The seat renewed on the 7th and stepped 6.5%. Across the three Berenberg
  reports 44 seats changed price or renewal date and none changed price within
  the same renewal date: price is a term attribute, only the exchange
  pro-rates move month to month.
- After: Jan at the 2026-04-07 term's price (2,215.00) + the earliest report's
  exchange (52.00), Feb and Mar at that term + their own exchange, Apr–Dec at
  the 2028-04-07 term (2,360.00) + the latest exchange (51.10); renewal
  projection only after 2028-04-07; each month converted at its month's rate.

## 2. Rulings already made (do not reopen)

- 2026-09-04: renewals always assumed; one two-year term projected past
  `renewal_date` at `SID_RENEWAL_INCREASE_PERCENT` (6.5%) on the seat price
  only; exchange charges pass through at cost.
- 2026-09-04: invoices of a SID-covered vendor are excluded from spend math
  whenever seats are in scope, still listed on the Invoices tab.
- 2026-09-04: no foreign keys from the SID tables to `org_employees`; the
  holder is the `last_user` name matched to the HR roster at read time
  (`matchHr`).
- 2026-09-08 (revised the same day): a seat's price belongs to its term and
  changes only at renewal. Each imported report is an observation of the term
  in force that month (`contract_date`, `renewal_date`, `price`); a seat's
  price for any month is the price of the observed term covering it, the
  latest observation of a term wins, the earliest observed term's price
  carries back to `contract_date`, the latest observed term carries forward
  to its `renewal_date` and then the renewal projection applies. Spend is only
  ever counted where a seat's dates overlap the query window.
- 2026-09-08: exchange charges are a monthly pass-through, never a commitment.
  They are modelled as a second engine product per seat with one-month
  segments: a report month takes that report's pro-rates, a month without a
  report takes the previous report's (the earliest report's for months before
  the first import). The seat price keeps its 12-month renewal-anchored
  slices, so the committed basis books exactly as it does today.
- 2026-09-08: a seat absent from the latest report ends at its last report
  month: no carry-forward, no projection.
- 2026-09-08: the assignments "Monthly" figure is one engine month bucket, not
  an annual value divided by 12.
- 2026-09-08: two PRs. PR A is the FX prefetch alone (it touches every spend
  surface in production). PR B is everything else, one commit per item,
  stacked on A.

## 3. Current state (where the code is)

- Seat → engine adapter: `lib/v2/bloomberg-sid/spend.ts`. `buildSidSeats`
  (price + exchange pro-rates from one report), `sidSeatSegments` (12-month
  slices walked back from `renewal_date` to `contract_date`, then the 24-month
  projection), `sidSegmentResolver`, `sidAllocations` (100% to the matched
  employee), `sidSpendRefs`. Ids are negative: account `-custNum`, seat
  `-(sid × 1000 + inst)`.
- Loader: `lib/v2/bloomberg-sid/population.ts` `loadSidSpendPopulation`. Reads
  the latest report per firmwide account via `fetchLatestSidSeatSource` in
  `lib/v2/bloomberg-sid/queries.ts` (one round trip per table per account).
- Query runner: `app/api/v2/handlers/spend/query.ts` `runSpendQuery`. Takes
  `scope.bloombergSid` (boolean or a preloaded population). Contracts go through
  the Redis derivation cache (`createCachedSegmentResolver`); seats do not, and
  must not.
- FX: `lib/v2/core/spendRates.ts` `buildSpendRateProvider`. Prefetches daily
  rates from the earliest term start across contracts AND seats to today, plus
  monthly averages over the span. Seat contract dates reach back to 2000, so a
  foreign-currency org loads ~9,700 daily rows per currency on every query.
- Conversion: `lib/v2/spend/baseCurrency.ts`. Amortized and actual convert per
  calendar month (`withMonthlyConversion`); committed converts at term start
  (`withTermStartConversion`).
- Rollup: `lib/v2/cost-allocation/rollup-report.ts` preloads the population once
  and runs three queries; merges `sid.employeesById` into the context by hand.
- Assignments: `lib/v2/assignments/service.ts` reads `contract_users` through
  `data/superuser/assignments.ts` (a second reader beside
  `lib/v2/cost-allocation/context.ts` `readSeats`), prices a seat from the
  contract's engine stamp (`scopeValuesOf` → `currentBase`) with `perMonth` in
  `lib/v2/assignments/cost.ts`. Labels: "Monthly cost" (KPI card, user panel,
  product sheet), "Monthly" (Users / Products tables), "/ month at risk".
  There is no "Avg monthly" anywhere.
- Slicers: `lib/v2/spend/slicers/amortized.ts` steps every month of every
  segment and discards out-of-window months; `committed.ts` books a segment in
  the bucket of its `from`. `ResolveOptions` in
  `lib/v2/spend/resolver/resolveFeeSegments.ts` carries `horizonEnd` only.

## 4. Work, in order

Two PRs against `development`, each through the full gate
(`npm run lint && npm run prettier:check && npx tsc --noEmit && npm test`).
Item 1 is PR A on its own. Items 2–5 are PR B, one commit each, in order;
items 2 and 3 change the engine side, 4 and 5 the seat population and the
assignments page. Item 6 stays optional.

### Item 1 (PR A) — FX prefetch bounded by basis

Standalone performance win for every spend surface, no figure changes.

- `buildSpendRateProvider` gains a `dailyRange: 'span' | 'term-starts'`
  input (or the basis itself). Amortized and actual fetch daily rates over the
  query span only; committed / commitments keep reaching back to the earliest
  term start. `runSpendQuery` knows `input.kind` / `input.basis` at the point it
  builds the policy (around the `CurrencyPolicy` construction).
- Keep the `EARLIEST_FETCHABLE_DATE` floor and the identity short-circuit.
- Tests: `__tests__/base-currency.test.ts` style — assert the daily fetch range
  passed to `getDailyUsdRates` for each basis; assert amortized figures are
  unchanged on a fixture with a 2000 term start.
- Verify on Berenberg locally: rollup and vendor pages render identical totals;
  the `fx_rates_daily` read drops from ~9.7k rows per currency to the span.

### Item 2 (PR B) — Window-bounded seat resolver

No figure changes. Bounds seat segment construction to the window.

- Add `horizonStart: Date` to `ResolveOptions` next to `horizonEnd`; the query
  runner passes `resolved.start`. The contract resolver ignores it for now (its
  segments are cached per component, not per window).
- `sidSeatSegments(seat, horizonStart, horizonEnd)`: emit only slices that
  overlap `[horizonStart, horizonEnd)`. Keep each slice's true `from`/`to` and
  `termStart` (do not clip a slice's start to the window — committed books in
  the FY of `from`, and a clipped start would move it).
- `sidSegmentResolver`'s memo must key on the window as well as the contract id
  (or be built per request with the window baked in, as the population already
  is).
- Tests in `__tests__/bloomberg-sid/`: a seat from 2000 queried for FY2026
  yields the two overlapping recorded slices (plus projection if in range) and
  nothing earlier; amortized / actual / committed totals equal the unbounded
  version on the same fixture (property test over a handful of windows).
- `queryTCV` sums every recorded segment of a contract, so a bounded seat
  resolver changes a TCV over seats. No surface runs TCV or renewals with
  seats; a test pins that a seat TCV is window-relative so the next caller
  finds out.

### Item 3 (PR B) — Per-term seat pricing with monthly exchange

Implements the 2026-09-08 rulings. Figures change; this is the point.

Loader (`queries.ts`, `population.ts`):

- Replace `fetchLatestSidSeatSource` with `fetchSidSeatSources(orgId,
firmwideId, window)`: the reports whose `report_month` falls in the window,
  plus the latest report before the window and the earliest after it, when
  they exist. One query per table with `report_id in (...)`, not one round
  trip per report.
- `buildSidSeats` takes the ordered list of report sources and produces one
  `SidSeat` per (sid, instance) carrying: `terms: Array<{ renewalDate,
monthlyPrice }>` (one per distinct `renewal_date` observed, the latest
  report's price for that renewal date wins, sorted ascending),
  `contractDate` from the latest report the seat appears in, `lastUser` from
  that report, `exchange: Array<{ reportMonth, monthlyExchangeCost }>` (one
  per report the seat appears in), and `lastReportMonth` (null when the seat
  is in the latest report loaded, so it is still live).

Segments (`spend.ts`):

Seat price, engine product `sidSeatProductId(seat)`:

1. Observed terms, earliest first. Term k covers `[termStart_k, renewalDate_k)`
   where `termStart_k` is the previous observed term's `renewalDate`, and the
   earliest term reaches back to `contractDate`. Each term is cut into
   12-month slices walked back from its own `renewalDate` (the first slice of
   the earliest term absorbs the remainder), `source: 'year-entry'`,
   `confidence: 'explicit'`, `termStart` = the term's start.
2. Renewal projection after the latest observed `renewalDate`: unchanged
   (`RENEWAL_TERM_MONTHS`, `sidSeatRenewedMonthlyRate` on the latest term's
   price, `source: 'renewal-projection'`).
3. A seat with `lastReportMonth` set ends at the end of that month: slices are
   truncated there, nothing projects.

Exchange, engine product `sidSeatExchangeProductId(seat)` (a second negative
id, disjoint from seat and account ids):

1. One one-month segment per calendar month the seat is live inside the
   horizon, at the exchange cost of that month's report, else the previous
   report's, else the earliest report's. `source: 'year-entry'`, `termStart`
   = the month start. Emit nothing for a month whose cost is 0.
2. No renewal step; exchange passes through at cost.

Also:

- `sidSpendContracts` fee rows: one row per seat product (latest term price × 12) and one per exchange product (latest exchange × 12). The rows exist for
  shape and the rate provider's term-start scan, not for placement.
- `sidAllocations`: one scope per seat product AND per exchange product, both
  100% to the employee `lastUser` matched.
- `sidSpendRefs`: the exchange key gets the same `productName`, `vendorId` and
  `productId` (the gptt) as the seat key, so the vendor list's
  `buildVendorProductRows` (`seat:<gptt>`) and the rollup fold both into one
  product line.
- Tests: fixture with Feb/Mar/Apr reports, a seat with terms (2026-04-07,
  2,215.00) and (2028-04-07, 2,360.00), exchange 52.00 / 51.10 / 51.10,
  contract 2000-04-07. Assert the FY2026 monthly series (Jan 2,267.00; Feb
  2,267.00; Mar 2,266.10; Apr–Dec 2,411.10), committed FY2026 equals today's
  figure for the price product, a seat that disappears in April has no April
  bucket, a seat whose `contract_date` is after the earliest import has no
  carry-back, and a month with no report between two imports takes the
  previous report's exchange.
- UI copy: the rollup subtitle and the vendor header note already say the
  renewal is an estimate; add "months after the latest import are at the
  latest report's rate" to the same note.

### Item 4 (PR B) — One seat population for contracts and Bloomberg

Refactor; no figure changes on the rollup.

- New module `lib/v2/seats/` (queries / transforms / service / types, per the
  `lib/v2/<module>` convention):
  - `Seat`: `{ key, source: 'contract_user' | 'bloomberg_sid', contractId,
productId, vendorId, vendorName, productName, holder: { orgEmployeeId |
null, displayName }, startDate, endDate | null, underused }`. Bloomberg
    seats use the negative engine ids so a seat's keys match `sidSpendRefs`
    without translation.
  - Adapters: `contract_users` rows → `Seat` (the one reader; delete
    `readAssignmentSeats` and point `readSeats` in the allocation context at
    it), `SidSeat` → `Seat`.
  - `loadSeatPopulation(orgId, window, { matchEmployees })` returns
    `{ seats, engine: SpendPopulation, employeesById, refs }`, where
    `SpendPopulation` is today's `SidSpendPopulation` generalised (contracts,
    resolver, allocations, `vendorIds`).
- `rollup-report.ts` consumes `loadSeatPopulation`; the hand-merge of
  `sid.employeesById` moves into the loader.
- Tests: rollup fixtures in `__tests__/cost-allocation/` pass unchanged; new
  adapter tests for both sources.

### Item 5 (PR B) — Bloomberg seats on the assignments page

- `loadAssignmentsPage(user, { window })`: default window is the latest
  imported report month (fall back to the current calendar month when the org
  has no seats). Runs one `runSpendQuery` over the seat population with that
  window, granularity `month`, grouped by product, and reads per
  (contract, product) base-currency values from the result. A Bloomberg
  seat's month is the sum of its seat-product and exchange-product buckets.
- `lib/v2/assignments/cost.ts`: `seatMonthlyCost` takes the month bucket for
  the scope instead of `perMonth(currentBase)`. Delete `perMonth` and
  `MONTHS_IN_YEAR`; `AssignmentsPayload.monthsInWindow` becomes the window's
  month count (1 by default) or is replaced by `window`.
- Bloomberg presentation: vendor = the linked Bloomberg vendor, product =
  `gptt_description`, delivery method = "Terminal", assigned date =
  `contract_date`, `underused` = holder inactive or unmatched. `ProductContractDetail`
  maps start = `contract_date`, end = `renewal_date`, licences = 1, rate =
  the month's price, order number and contract type null. Unmatched seats keep a
  null holder and appear as unlinked seats at firmwide scope, as unlinked
  contract users do today.
- Month picker: reuse `ReportWindowParams` / `resolveRollupWindow` from
  `lib/v2/cost-allocation/report-window.ts` with a month-granularity policy;
  URL params `from` / `to` as on the rollup. KPI and table labels stay
  "Monthly"; add the window (e.g. "April 2026") to the KPI card footnote.
- Behaviour change to call out in the PR: contract seats move from FY ÷ 12 to
  the selected month's bucket, so a contract that renews or steps mid-year
  shows that month's rate. Product has agreed to the definition; the label
  discussion ("Monthly" vs "Avg monthly") is closed in favour of "Monthly".
- Tests: `__tests__/assignments/assignments-page.test.tsx` fixtures updated;
  new cases for a Bloomberg seat (monthly = report price × month FX), an
  unmatched seat, and a month with no report (carry-forward rate).

### Item 6 (optional, product call) — Persisted holder override

Only if the Permissions tab needs manual corrections to the name match. Table
`bloomberg_sid_seat_holders (organization_id, firmwide_id, sid, sid_inst_num,
org_employee_id, set_by, set_at)`; `employeeOf` in the population loader
consults it before `matchHr`. Migration functions pin
`SET search_path TO 'public', 'pg_temp'`. No backfill.

## 5. Performance envelope (Berenberg, ~350 seats, ~2,300 fee lines per report)

| Window                             | Reports read                            | Seat segments (approx)                                                       |
| ---------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------- |
| Latest month (assignments default) | 1                                       | 1 per seat                                                                   |
| Current FY (rollup default)        | in-window reports + the nearest outside | ≤ 3 price slices + ≤ 12 exchange months per seat                             |
| All Time                           | every report                            | price slices to `contract_date` + one exchange month per month in the window |

Work scales with the window, not with a seat's lifetime. The FX prefetch (PR 1)
is the largest fixed cost today and is removed for amortized / actual.

## 6. Verification checklist (end state, Berenberg local clone)

- Permissions tab, April 2026, SID 266891/5: 2,411.10 USD.
- Assignments, window April 2026, "user 492 ffm": 2,411.10 × April USD→EUR
  monthly average (≈ 0.8555 in the local `fx_rates_daily`) ≈ 2,062.6 EUR.
- Rollup, Current FY, same user: Jan at 2,267.00, Feb 2,267.00, Mar 2,266.10,
  Apr–Dec 2,411.10, each × its month's multiplier; total ≈ 24,520 EUR (lower
  than today's 24,893 because Jan–Mar now carry the pre-renewal term's price).
- Rollup Current FY total equals the sum of twelve assignments month windows
  for the same population.
- A seat present in Feb/Mar but not Apr contributes nothing from April on.

## 7. Open questions

- Dashboard and budget-overview totals still exclude seats (opt-in per
  surface). Unchanged by this plan; one-line flip when product decides.
- Whether the assignments month picker should offer only imported months or
  any month (carry-forward months would show the latest rate).
- Whether the inventory Permissions tab should also show the base-currency
  figure beside USD, now that the two agree by construction.

## 8. Out of scope

- Changing the engine's segment model (fee over a dated span). Per-month
  segments fit it as-is; the internal rate × span / span arithmetic is exact.
- Putting seats through the Redis derivation cache.
- Reworking contract seat allocation semantics (`contract_cost_allocations`).
