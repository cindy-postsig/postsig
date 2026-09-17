# Bloomberg SID Across the App — Surfaces Plan

Companion to `docs/bloomberg-seat-spend-plan.md` (engine side, shipped) and
`docs/bloomberg-sid-prototype-map.md` (inventory view). Written 2026-09-08
from `development`.

## 1. Product asks and rulings

Product follow-ups, in their words, with the ruling applied:

| Ask                               | Ruling                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Inventory tab: BBG line item      | One rolled-up Bloomberg row (not per product, not per account).                                           |
| Dashboard Top Vendors             | Bloomberg's bar is its annual seat total; ranks with the others.                                          |
| Spend chart, Amortized and Actual | Seats as one "Bloomberg SID" line item.                                                                   |
| Spend chart, Contract term        | Hidden (her call 2026-09-08). Seats appear on Amortized and Actual only; Contract Term is contracts-only. |
| Spend tab: rolled-up annual cost  | One Bloomberg row in the table; cards and chart inherit the chart change.                                 |
| Renewals report                   | One Bloomberg row for the window: seats renewing in range. Monthly email is a separate stack, later.      |
| Calendar                          | Skip this release.                                                                                        |

"One line item" means everything Bloomberg rolled into one row, everywhere it
appears in these surfaces. The vendor page's own Products tab keeps its
per-product SID rows; that page is about the vendor.

## 2. Facts from the uploaded data (local Berenberg clone, 2026-09-08)

- 1 firmwide account, 1 organization with SID data.
- The latest report (April 2026) has 351 seats under 18 billing accounts
  (`cust_num`), all one of two legal entities.
- 214 distinct renewal dates across those 351 seats. Seats renew on their own
  anniversaries, so any per-seat or per-date listing is hundreds of rows. The
  renewals report shows one Bloomberg row for the whole window instead.
- 39 active Bloomberg invoice contracts exist for the org. They are the bills
  for the seats, so any surface that shows seats must drop them.

## 3. Existing rules to reuse, not reinvent

- **Engine merge** — `runSpendQuery(userMetadata, input, { bloombergSid })`
  folds seats into any query (window, basis, grouping, currency) and drops
  invoice-type contracts of seat vendors. Used by vendor header, vendors
  list, assignments, allocation rollup. Not yet used by the HTTP handler
  that feeds the client charts and cards.
- **Invoice exclusion today** — inventory, renewals report and calendar
  exclude all invoices already. The budget table and Top Vendors keep
  invoices but drop stale ones (`excludeStaleInvoices`, activity before the
  current FY start). The gap: in-FY Bloomberg invoices still count on those
  two surfaces.
- **SID inventory rows** — `sidProductInventoryItems` in
  `lib/v2/bloomberg-sid/transforms.ts` already builds `InventoryItem`s
  (`source: 'bloomberg-sid'`) from `getVendorSidProducts`; the vendor page
  appends them itself. The Inventory tab row is a rollup of the same input.
- **Refs** — `sidSpendRefs` labels seat keys; a collapsed key needs one more
  ref entry.

## 4. Work, in order

One PR against `development`, one commit per item below, in order (her call
2026-09-08: no PR stack). Each commit leaves the tree green through the full
gate (`npm run lint && npm run prettier:check && npx tsc --noEmit && npm test`);
the husky pre-commit typechecks the working tree, so stage a commit only once
the tree as a whole compiles. Ids of synthetic rows use the string prefix
`bloomberg:<vendorId>` so they can never collide with contract ids or the
engine's negative seat ids.

### Commit 1 — Spend endpoint includes seats; chart shows one Bloomberg line

Covers: Spend chart (Amortized and Actual), Spend tab cards, dashboard Spend
Overview cards. Consumers of the endpoint are exactly `SpendChart.tsx` and
`useCostMethodTotals.ts`; the MCP `get_spend` tool calls the runner directly
and is left as is.

1. `querySpendHandler` passes `{ bloombergSid: input.kind === 'spend' }`:
   Amortized and Actual include seats, Contract Term (`kind: 'commitments'`)
   does not. On Contract Term the Bloomberg invoices count again, because the
   engine drops them only when seats are in scope, so the cards and chart move
   between methods by design. An org without SID data loads an empty
   population and nothing changes for it.
2. New pure function `collapseSidLineItems(items, sid, vendorLabel)` in
   `lib/v2/bloomberg-sid/spend.ts`: for `groupBy: 'contract'`, every item whose
   key is a seat contract key (present in `sid.refs`, numeric and negative)
   is re-keyed to `bloomberg:<vendorId>` and summed per period; the ref for
   that key is `{ label: 'Bloomberg SID', vendorId, vendorDomain }`. Other
   groupings are untouched (vendor grouping already rolls up; product and
   allocation groupings are what the vendors list and rollup want).
3. `runSpendQuery` applies the collapse after `mergeLineItems` when
   `input.groupBy === 'contract'`.
4. Check `toChartData` / `toCommitmentChartData` tolerate a non-numeric key
   (they read `refs[groupKey]` for labels; confirm no `Number()` cast).
5. Tests: collapse merges N seat accounts into one key and preserves totals
   per period; contract items untouched; a query with `groupBy: 'total'` is
   unchanged. Handler test pins that the scope is set.

Verify on Berenberg: Spend tab chart shows one "Bloomberg SID" line on
Amortized and Actual and none on Contract Term; Amortized cards equal the
vendor page header plus the rest of the org when the org default is Amortized.

### Commit 2 — Dashboard Top Vendors

1. New `getSidVendorTotals()` in `lib/v2/vendors/service.ts` (reuse
   `vendorSpendRunner`): loads the population over currentFY..nextFY once,
   runs `groupBy: 'vendor'` for currentFY and nextFY, returns
   `{ byVendorId: Map<vendorId, { current, projected }>, vendorIds }` in
   cents, base currency, always on the Amortized basis (the annual sum of
   monthly seat costs; seats are hidden on Contract Term, so the org default
   cannot drive this). Empty map for orgs without SID data.
2. `TopVendorsSection` and `getDashboardData`: drop invoice-type contracts
   whose `vendor_id` is in `vendorIds` BEFORE `buildBudgetSummary` (same
   predicate the engine uses; extract it as `isSidVendorInvoice(ec, vendorIds)`
   next to the engine's use). Then `aggregateTopVendors(...)` and add the seat
   totals to the Bloomberg entry's `currentBudget` / `projectedBudget`,
   creating the entry (name/domain from the query refs) when the vendor has no
   contracts. `totalContractValue` stays contract-only (seat TCV is
   window-relative by design).
3. `TopVendorsValueLabel` totals: `currentTotal` / `projectedTotal` add the
   seat totals so the subheader agrees with the bars.
4. Tests: a fixture with Bloomberg invoices plus a seat total ranks the vendor
   by the seat figure and does not double count; a vendor with seats and no
   contracts appears.

### Commit 3 — Spend tab: one Bloomberg row in the table

The table's engine columns stay on the committed basis regardless of the
selector (product decision 2026-08-05). Seats are hidden on that basis, so the
Bloomberg row carries the Amortized annual figure instead: the rolled-up sum
of monthly seat costs for the fiscal year, the number product asked for.

1. `ContractsTable` gains `extraRows?: ContractTableRow[]`, appended after
   `buildContractTableRows`. `ContractsTableClient` row link: an id with the
   `bloomberg:` prefix links to `/vendors/<vendorId>/inventory`; row actions
   that need a contract (edit, delete, folders) skip it; export includes it.
2. `sidBudgetRow(totals, vendor)` in `lib/v2/bloomberg-sid/transforms.ts`
   builds the `ContractTableRow`: id `bloomberg:<vendorId>`, vendor name and
   domain, product `Bloomberg SID · N seats`, type `Subscription`, renewalType
   `Auto`, dates null, `currentBudget` / `projectedBudget` and their
   `converted*` twins from the Amortized engine totals (already in base
   currency), `annualDifference` = projected − current, everything else the
   type's empty value.
3. `BudgetOverviewServer`: drop Bloomberg invoice rows with the shared
   predicate, take the two Amortized totals from `getSidVendorTotals()`
   (commit 2), pass the row as
   `extraRows`. Historical FY view: no row (the population is loaded for
   currentFY..nextFY; a past FY needs its own load — out of scope, note it).
4. Tests: row builder shape; server component drops the invoices and appends
   one row; a non-SID org renders unchanged.

### Commits 4 and 5 — Inventory tab row, then renewals report row

Inventory:

1. `sidVendorInventoryItem(products, vendor)` next to
   `sidProductInventoryItems`: one `InventoryItem`, id `bloomberg:<vendorId>`,
   productName `['Bloomberg SID']`, `licensesCount` = Σ seats, `activeUsers` =
   every product's users, cost = Σ monthlyCost × 12, `currency: 'USD'`,
   `source: 'bloomberg-sid'`. Same known limitation as the vendor page (USD,
   not base currency); a follow-up can price it from the engine.
2. `app/(app)/(cpm)/inventory/page.tsx` appends it, the way the vendor page
   does: resolve the SID vendor from `bloomberg_firmwide_accounts`
   (`fetchFirmwideAccounts(orgId)`), load `getVendorSidProducts(vendorId)`.
   `InventoryTableClient` / `InventoryItemSheet`: the row opens the sheet
   read-only and links to the inventory view; no contract actions.

Renewals (auto-renewals pipeline only; every account carries the same
auto/term flags and the 2026-09-04 ruling assumes renewal):

1. `autoRenewalsReport` gains an `enrich` step that loads the seat records
   (`loadSidSpendPopulation(...).seats`, or a lighter `fetchLatestSidSeats`)
   and keeps the seats whose next `renewal_date` falls in `[today, today +
range]`.
2. `transform` appends ONE `ContractTableRow` when that set is non-empty, via
   `sidRenewalRow(seats, vendor)`: id `bloomberg:<vendorId>`, product
   `N terminal seats renewing`, `termEndDate` = earliest renewal date in
   range, `cancelByDate` = that date − 60 days (prototype rule the inventory
   view already applies), renewalType `Auto`, `currentBudget` =
   Σ monthlyPrice × 12, `projectedBudget` = current × (1 + 6.5%), USD.
3. `calculateTotal` already sums `projectedBudget` over rows, so the total
   follows. `count` for the dashboard preview is `rows.length`, so Bloomberg
   counts once.
4. The dashboard `AutoRenewalsSection` and `/reports/auto-renewals` share the
   pipeline; the row link goes to
   `/vendors/<vendorId>/inventory?tab=subscriptions`, where the per-seat
   renewal and cancel-by dates already live.
5. Tests: range filter and the 60-day cancel-by; no row when nothing renews
   in range; totals include the row; non-SID org unchanged.

## 5. Out of scope, noted

- Monthly renewals email: `supabase/functions/email-contracts-alerts-weekly`
  reads contracts in SQL; adding seats means a DB function change or moving
  the email to Inngest. Separate ticket.
- Calendar: `getCalendarData` events are enriched contracts; the renewal row
  builder from commit 5 would feed it in a day when wanted.
- Historical FY on the Spend tab and Top Vendors TCV toggle stay
  contract-only.
- Base-currency conversion for the Inventory and renewals rows (they are USD
  like the vendor page's SID rows).
- MCP `get_spend` tool: still contracts-only; flip its scope when the
  assistant should see seats.

## 6. Hand-off notes for the executing agent

Everything needed is in this file plus the code; the conversation that
produced it is not required.

- **Branch**: cut `feature/bloomberg-sid-surfaces` from an up-to-date
  `development`. Ask before every git operation (branch, commit, push, PR);
  never push or open the PR unprompted. Conventional Commits with the
  `psk-1941` ref, e.g. `feat(spend): include Bloomberg seats on flow bases`.
  No AI attribution, session links or ticket refs in code.
- **Repo conventions**: `AGENTS.md`. Strict TS, no `any`, no comments that
  restate code, pino logger, `@/` imports. Data layer for the module lives in
  `lib/v2/bloomberg-sid/` (queries.ts / service.ts / transforms.ts /
  spend.ts / population.ts), never `data/superuser`.
- **Tests**: `__tests__/bloomberg-sid/*.test.ts` hold the existing seat
  fixtures (`spend.test.ts`, `population.test.ts`); `__tests__/vendors/`,
  `__tests__/reports/`, `__tests__/inventory/` hold the surface tests. Run
  a single file with `npm test -- <path>`. `prettier:check` repo-wide is
  slow; run `npx prettier --check` on changed files while iterating and the
  full gate before each commit.
- **Do not**: run the Supabase CLI, write to any database, reset the local
  DB, or `npm install` in a worktree. Read-only `psql` against
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres` is fine and is
  how §2 was verified.
- **Verification data**: the Berenberg org is cloned into the local
  Supabase (Bloomberg vendor id 469, one firmwide account, reports for
  2026-02..2026-04). Dev server: `npm run dev` on the port the checkout is
  pinned to (`.env.local`); never 3000/4000/8000 for anything else. Pages
  to eyeball: `/dashboard` (Spend Overview, Top Vendors, Auto Renewals),
  `/budget` (cards, chart, table), `/inventory`, `/reports/auto-renewals`,
  and `/vendors/469` for the numbers the new rows must agree with.
- **Existing decisions that bind this work** (do not reopen): rulings in
  `docs/bloomberg-seat-spend-plan.md` §2 (renewals assumed, 6.5% step, SID
  vendor invoices excluded when seats are in scope, no FKs to employees);
  the budget table's engine columns stay on the committed basis (2026-08-05);
  seats hidden on Contract Term (§1 here).
- **Where each surface reads today** (start here, in order): spend endpoint
  `app/api/v2/handlers/spend/query.ts` (`querySpendHandler`, `runSpendQuery`);
  chart `components/budget/SpendChart/` and `hooks/api/useCostMethodTotals.ts`;
  dashboard `components/dashboard/sections.tsx` and
  `lib/v2/dashboard/service.ts`; Top Vendors aggregation
  `lib/v2/vendors/transforms.ts`, seat runner `lib/v2/vendors/service.ts`
  (`vendorSpendRunner`, `getVendorSpendIndex`); budget page
  `app/(app)/(cpm)/budget/(overview)/server-components.tsx` and
  `components/contracts/ContractsTable.tsx` / `ContractsTableClient.tsx`;
  inventory `app/(app)/(cpm)/inventory/page.tsx`, `lib/v2/inventory/service.ts`,
  SID rows `lib/v2/bloomberg-sid/transforms.ts` (`sidProductInventoryItems`)
  and the vendor page `app/(app)/(cpm)/vendors/[id]/page.tsx` that appends
  them; renewals `lib/v2/reports/definitions/renewals.ts`,
  `lib/v2/reports/pipeline/{types,runner}.ts`.
- **Done means**: all five commits on the branch, full gate green, each
  page above checked on Berenberg locally with seats visible on Amortized
  and Actual and absent on Contract Term, and a PR description as a bullet
  list of what changed (no narrative). Then stop and report; pushing and
  opening the PR wait for her go.
