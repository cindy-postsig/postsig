# Bloomberg SID view — prototype adaptation map (PSK-1941)

How the Lovable prototype's `/market-data/bloomberg` page maps onto the `bloomberg_*` tables
(`docs/bloomberg-sid-schema-design.md`). The v1 scope is the six tabs the prototype still shows
after the 9/1 clean-up: Overview · Accounts · Terminal Subscriptions · Exchange Entitlements ·
Permissions · Costs, plus the Documents tab the ticket asks for. Invoice Management, Changes,
Change Activity and Issues are out.

Route: `/vendors/[id]/inventory`, linked from the vendor page whenever
`bloomberg_firmwide_accounts` names that vendor for the organization. `?month=yyyy-MM-dd` picks
the report month (default: latest imported), `?tab=` the tab, `?firmwide=` the firmwide ID when an
organization holds more than one.

## Status legend

- **built** — from `bloomberg_*` tables (plus `org_employees` / `org_units` for the HR surfaces)
- **decision** — built one way, needs a product call (see _Decisions_)

## Page header and KPI grid

| Prototype element                 | Source                                                                                                 | Status   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ | -------- |
| Bloomberg logo                    | vendor icon of the `vendors` row on `bloomberg_firmwide_accounts.vendor_id`                            | built    |
| "firmwide ID … · N entities"      | `bloomberg_firmwide_accounts.firmwide_id`; count of `bloomberg_sid_accounts` rows in the report        | built    |
| Report month picker (any month)   | `bloomberg_sid_reports.report_month`; only imported months are selectable                              | decision |
| "Status: Active / Ingested" badge | static in the prototype; ported static                                                                 | decision |
| Terminals · Products              | distinct `subscriptions.gptt`                                                                          | built    |
| Terminals · Subscriptions         | count of `bloomberg_sid_subscriptions`                                                                 | built    |
| Exchanges · Products              | distinct `exchange_fees.exchange_code`                                                                 | built    |
| Exchanges · Allocations           | count of `bloomberg_sid_exchange_fee_lines`                                                            | built    |
| Terminals · Cost                  | Σ `subscriptions.price`                                                                                | built    |
| Exchanges · Charges               | Σ unmasked `fee_lines.pro_rate` of seats present in the month's subscription snapshot (prototype rule) | decision |
| Total Direct Cost                 | Terminals · Cost + Exchanges · Charges                                                                 | built    |

## Overview

The seven KPIs render inside this tab only, grouped Terminals · Exchanges · Total direct cost, so the other tabs start at the tab bar.

| Section / field                                                                              | Source                                                            | Status |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------ |
| Terminals · Product mix                                                                      | `subscriptions.gptt_description` counts, sorted by count          | built  |
| Terminals · Price distribution                                                               | `subscriptions.price` counts                                      | built  |
| Exchanges · Entitlement coverage: entitled of terminal subs, allocated SIDs not in inventory | subscriptions vs distinct `(sid, sid_inst_num)` in fee lines      | built  |
| Exchanges · Charges: priced of allocation rows, known charges, masked aggregates             | `fee_lines.pro_rate is null`, `exchange_fees.total_price is null` | built  |

## Accounts (file `-0`)

One row per `cust_num`. The prototype groups by entity name and shows the first Cust Num; real files
have 17 accounts sharing one legal-entity name with different cities and tax rates, so grouping by
name loses the account (decision 1).

| Column                        | Source                                                                     | Status |
| ----------------------------- | -------------------------------------------------------------------------- | ------ |
| Cust Num                      | `accounts.cust_num` (`-0` Cust Num)                                        | built  |
| Entity                        | `accounts.name` (Name)                                                     | built  |
| City / Country                | `accounts.city` / `accounts.country` (City / Ctry)                         | built  |
| Auto / Term                   | `accounts.auto` / `accounts.term` (Auto / Term) — prototype hard-coded `2` | built  |
| Tax Rate                      | `accounts.tax_rate` (Tax)                                                  | built  |
| Currency                      | `accounts.currency_code` (Curr), `D` shown as USD                          | built  |
| Terminal Subs / Terminal Cost | subscriptions of the account: count / Σ price                              | built  |
| Exchange Products             | distinct exchange codes among allocations of the account's seats           | built  |
| Known Exch Cost               | Σ unmasked `pro_rate` of the account's seats                               | built  |
| Masked Rows                   | masked allocation rows of the account's seats                              | built  |
| Total Direct Cost             | Terminal Cost + Known Exch Cost                                            | built  |
| TOTAL row                     | sums of the above                                                          | built  |

Exchange figures follow the seat's owner (`subscriptions.cust_num`), not the fee row's `cust_num`,
as in the prototype's `bbgEntityRollup`.

## Terminal Subscriptions (file `-2`)

| Column / control                                                                                             | Source                                                                                                                                                                      | Status  |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Cust Num / SID                                                                                               | `subscriptions.cust_num` / `sid`                                                                                                                                            | built   |
| SN/UUID                                                                                                      | `subscriptions.serial_number`; header relabelled from UUID 2026-09-15                                                                                                       | built   |
| Last User                                                                                                    | `subscriptions.last_user`                                                                                                                                                   | built   |
| Product                                                                                                      | `subscriptions.gptt_description`                                                                                                                                            | built   |
| Contract Date / Renewal Date                                                                                 | `contract_date` / `renewal_date`                                                                                                                                            | built   |
| Cancel By                                                                                                    | renewal date − 60 days; red within 30 days of today (prototype rule)                                                                                                        | built   |
| Price                                                                                                        | `subscriptions.price`                                                                                                                                                       | built   |
| Inactive Last 90 Days                                                                                        | `subscriptions.ninety_day` (`90 Day` = `*`)                                                                                                                                 | built   |
| Auto / Term                                                                                                  | the seat's account row                                                                                                                                                      | built   |
| Status                                                                                                       | the matched employee's `org_employees.status` plus `ninety_day`: Active, else Inactive (Leaver) / (Employee not found) / (On leave) / (No use in 90 days), reasons combined | HR      |
| Actions "Change…", "+ Add subscription", "Pending …" pill                                                    | Changes feature (out of scope per 9/1 notes)                                                                                                                                | omitted |
| Search SID / SN/UUID / last user; filters Cust Num / Entity Name / Product / Status / Renewing within; sorts | search added 2026-09-08; Status and Renewing within added 2026-09-15, the latter seeded by `?renewing=` from the renewals report                                            | built   |
| Drawer: Terminal subscription block                                                                          | as above + `po_number`                                                                                                                                                      | built   |
| Drawer: Exchange allocations                                                                                 | fee lines of the seat                                                                                                                                                       | built   |
| Drawer: HR match (Confidence, HR Employee, Department, Cost Center)                                          | employee mapping                                                                                                                                                            | HR      |

## Exchange Entitlements (file `-4`)

| Column / control                                                                | Source                                                                                 | Status   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------- |
| Top exchanges by direct cost / by subscription count                            | `exchange_fees` grouped by `exchange_code`                                             | built    |
| Aggregate: Cust Num, RPT Month, Exchange, Name, Subs, Currency, Total Price     | `exchange_fees` columns; admin-fee rows (`ADMnn`, `fee_kind = admin`) included         | decision |
| Aggregate: Price Status                                                         | Direct bill to vendor = `total_price is null`; else Direct to BBG (a $0 row included)  | built    |
| Aggregate: Total Price "enter price" input on masked rows                       | prototype local state; nothing stores it                                               | decision |
| SID Allocation: Cust Num, RPT Month, Exchange, SID, Inst, Pro Rate              | fee line + parent fee                                                                  | built    |
| SID Allocation: SN/UUID                                                         | `serial_number` of the seat in the month's snapshot, `—` if the seat swapped mid-month | built    |
| Search SID / SN/UUID / exchange; filters Cust Num / Entity Name / Exchange Code | search added 2026-09-08                                                                | built    |

`RPT Month` differs from the report month: the April report carries 464 rows for May (billed in
advance) and 49 for April (catch-up). Both are shown, as the prototype shows its column.

## Permissions (files `-2` + `-4`)

| Column / control                                                                                                                                | Source                                                                                                                                                                                              | Status |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| SIDs permissioned / Total permissions / Actual cost                                                                                             | subscriptions + fee lines                                                                                                                                                                           | built  |
| Row: Cust Num, SID, Entity, Last User, Terminal Product, Contract Date / Cancel By / Renewal Date, Exchanges, Terminal / Exchange / Actual Cost | seat + its fee lines; the same `contract_date` / `renewal_date` (and cancel-by rule) the Terminal Subscriptions tab shows — the prototype's "Effective From/To" were these fields under other names | built  |
| Status                                                                                                                                          | the same rule as the Terminal Subscriptions tab: the matched employee's `org_employees.status` plus `ninety_day`                                                                                    | HR     |
| Expanded: Terminal row (Code = `gptt`, the seat's dates), Exchange rows (code, name, `rpt_month`, `pro_rate` or `***`)                          | as above                                                                                                                                                                                            | built  |
| Search SID / last user; filters Cust Num / Entity / Product; sorts SID / dates / Exchanges / Actual Cost                                        | search added 2026-09-08                                                                                                                                                                             | built  |

## Costs

| Strip / view                                                                                                                 | Source                                                                                     | Status |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ |
| Metric strip: Terminal Cost (+ average), Exchange Charges (month), Masked Allocation Rows, Masked Aggregate Rows             | subscriptions; masked = `fee_lines.pro_rate is null` / `exchange_fees.total_price is null` | built  |
| Cost Allocations explorer, view **Country › City**                                                                           | the seat's account `country` / `city`                                                      | built  |
| Cost Allocations explorer, view **HR level** (Entity › Business Group › Division › Business Unit › Department › Team › User) | employee mapping + `org_units`                                                             | HR     |
| Cost Allocations explorer, view **Cost center**                                                                              | employee mapping + `org_employees.cost_center`                                             | HR     |
| Budget / Variance                                                                                                            | removed per 9/1 notes                                                                      | —      |

The prototype's Costs tab is a roll-up of SID data by a chosen hierarchy; it does not read the
cost-allocation module (`contract_cost_allocations`). Nothing on the v1 tabs does.

## Employee mapping (the one dependency outside `bloomberg_*`)

The prototype's `bbgHrMatch` matches `subscriptions.last_user` (a free-text name, no email) against
the HR roster: exact full name → last name → none. In this app that would read `org_employees`
(`first_name`, `last_name`, `department`, `cost_center`, `org_unit_id`) and walk `org_units`
(levels entity · business_group · division · business_unit · department · team; cost_center flat)
for the HR-level view. It feeds three surfaces: the drawer's HR match block, and the HR level and
Cost center views of the Costs explorer.

Match rule (prototype's `bbgHrMatch`): exact case-insensitive full name → "Exact name"; the last
word of `last_user` equals an employee's last name → "Fuzzy name"; otherwise "Missing HR match".
Proxy (`PROXYUSER BMDS3519_5`), desk (`BCM ECM`, `MIDDLEOFFICE BERENBERG`) and `leaver_N` accounts
land in the last bucket by design. The HR-level path is Entity (from the SID account, as in the
prototype) › Business Group › Division › Business Unit › Department › Team (from the employee's
`org_units` chain, a missing level shows as "—") › User; the Cost center view uses
`org_employees.cost_center`.

## Not in the prototype

- **Documents tab** (ticket, 9/1 notes): view and download the eight original files from
  `bloomberg_sid_report_files` (bucket `documents`, `<org>/bloomberg-sid/<firmwide id>/<month>/`).
  Built on ruling 9 with columns File · Purpose · Rows · Size · View / Download.
- **Products tab entry** (ruling 10): the vendor page lists the SID terminal products under the
  inventory products, linking into the Terminal Subscriptions tab.
- **Module gating** (admin-app flag): outside this schema, as with cost allocation.
- **Vendor merge resolution**: the account stores `vendor_id` as chosen; the vendor page itself
  reads raw ids, so the SID page does too for now.

## Decisions (rulings 2026-09-03)

1. **Accounts tab granularity** — one row per `cust_num`. Ruled: keep.
2. **Changes entry points** (Actions select, "+ Add subscription", "Pending" pill) — left out. Ruled: keep.
3. **Employee mapping** — the anonymised sample writes `user 615_ldn` while the HR roster has
   `User 615` / `LDN`; verified that dropping the underscore matches 974 of 1,068 seats exactly, with
   only proxy, desk and leaver accounts left over. The local `last_user` values were rewritten
   (`user N_xxx` → `user N xxx`, other accounts untouched), and the HR match block plus the HR level
   and Cost center views are built on `org_employees` + `org_units` (see _Employee mapping_).
4. **Total Exchange Charges rule** — prototype's snapshot-seat rule kept for now. Open: product.
5. **Admin-fee rows** — ruled: match the prototype, which counts them separately and keeps them out
   of the aggregate view; they are now excluded from the Exchange Entitlements tab and its counts.
6. **"Enter price" input on masked rows** — kept as in the prototype (no storage).
7. **Row caps** — ruled: none. Every large table paginates with a row-count selector; the data layer
   already fetches every row.
8. **"Status: Active / Ingested" badge** — removed: static, so it read the same on every report.
   The Terminal Subscriptions and Assignments tabs carry an HR-based Status column in its place
   since 2026-09-15, reading the matched employee's roster status alongside Bloomberg's 90-day
   flag, so "inactive" there means what the Assignments page's underutilized count means.
9. **Documents tab** — ruled: build. Lists the eight files of the selected month from
   `bloomberg_sid_report_files` with view and download links (signed URLs, one hour).
10. **Entry points** — the header button stays, and the vendor page's Products tab also lists the
    terminal products parsed from the SID file (one row per GPTT product: seats, monthly cost),
    each linking into the Terminal Subscriptions tab filtered to that product.
