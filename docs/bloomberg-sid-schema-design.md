# Bloomberg SID Report Schema Design (PSK-1941)

Schema to store Bloomberg's monthly **firmwide SID file set** (SID = Subscriber ID, one terminal
seat; the real key is SID + SID Instance Number). Derived from the anonymised Berenberg sample
`Bloomberg (Q2 2026)/SID Report {02,03,04}_2026` (firmwide ID 28929, Feb–Apr 2026). Every claim
marked _verified_ was checked programmatically across all three months.

These tables are **standalone**: they hold the files as delivered, scoped to an organization,
with no foreign keys into `org_employees`, `org_units` or `contracts`. Attribution to entities,
employees and spend is done in code and UI on top of them (see _Join keys_ below). The one link
outward is the vendor: each firmwide account names the `vendors` row it is booked under, and every
report hangs off an account (see _Vendor association_).

## What a monthly SID file set is

One folder per month, eight CSVs named `<firmwide id>-<N>_….csv`, `N = 0..7`. Headers are
identical across the three months for every `N` (_verified_). Product note: store every field
from every file, whether or not it is used yet.

| N   | Content                                                          | Data rows Feb / Mar / Apr | Table                                    |
| --- | ---------------------------------------------------------------- | ------------------------- | ---------------------------------------- |
| 0   | Legal entities / billing accounts under the firmwide ID          | 20 / 20 / 20              | `bloomberg_sid_accounts`                 |
| 1   | Subscription change activity, 18 columns                         | 39 / 17 / 15              | none — exact prefix of `-7`              |
| 2   | Terminal subscriptions: month-end snapshot of every SID instance | 359 / 358 / 351           | `bloomberg_sid_subscriptions`            |
| 3   | Exchange entitlements, 12 columns                                | ~2.8k                     | none — `-4` minus one column             |
| 4   | Exchange entitlements + `EID Number`                             | ~2.8k                     | `bloomberg_sid_exchange_fees` + `_lines` |
| 5   | Research report purchases                                        | 0 (header only)           | `bloomberg_sid_research_purchases`       |
| 6   | Material / hardware charges                                      | 0 (header only)           | `bloomberg_sid_material_charges`         |
| 7   | Change activity + 10 billing columns, 28 columns                 | 39 / 17 / 15              | `bloomberg_sid_changes`                  |

_Verified_: `-7` columns 1–18 are row-for-row identical to `-1`; `-4` with `EID Number` removed is
row-for-row identical to `-3`. Loading `-1` and `-3` would store every value twice, so the
importer parses `-0`, `-2`, `-4`, `-5`, `-6`, `-7` and keeps `-1`/`-3` only as stored files.

Vocabulary (from PSK-1941 and the files):

- **Firmwide ID** — the top-level group account (`New Cust` column in `-0`, the file-name
  prefix; 28929). The ticket's file-0 callout says "Cust Num is the firmwide ID"; in the files
  the constant is `New Cust` and `Cust Num` varies per row.
- **Cust Num** — a legal entity / billing account under the firmwide ID (`30041555` = Berenberg
  London). Every SID belongs to exactly one Cust Num; it is the join key for cost roll-ups.
- **SID + SID Inst Num** — one install of one seat. Instance number bumps on relocation or swap.

The sibling folders (`30041555 London`, …) are **quarterly invoice bundles**
(`<cust>-<invoice num>-{0..4}` + `inv-*.pdf`). They reuse the `-0`, `-1`, `-3` layouts and add
invoice lines keyed on `(Invoice Number, Invoice Line, SID, SID Inst Num)`. Out of scope for this
story (invoice reconciliation is a later one), but they confirm the keys.

## File format quirks the importer must handle

- **NUL padding.** Files are padded with `0x00` to 1 KiB multiples. Strip before parsing.
- **`?` means not applicable** → `NULL` (`-2`, `-4`, `-7`).
- **`\***`in`-4`price columns** →`NULL`. Per PSK-1941: Bloomberg pipes the data through but
  does not charge for that line; the exchange bills the client directly. ~700 rows per month.
- **Dates.** `MM/DD/YY` in `-0`, `-4`, `-7` (`03/01/26`). `-2` uses `DD.MM.YYYY`, `;` delimiter
  and CRLF. The `-2` files were modified in July, after the rest of the set, so this is most likely
  an artefact of re-saving during anonymisation (German Excel locale), not Bloomberg's format.
  Detect delimiter and date format per file rather than hard-coding either.
- **Numbers** are space-padded (`"       60.60"`, `"         .00"`); IDs in the `Related`
  columns of `-7` are zero-padded (`000007442760`, `00003`, `0030143229`). Parse numerically.
- **Placeholder / section rows**, dropped on import:
  - `-1`/`-7`: `<cust>,"No Subscription Change Activity"`
  - `-3`/`-4`: `<cust>,"No Exchanges"` and `<cust>,"Exchange Administration Fees"` (the latter
    is a section header for the admin-fee rows that follow it)
- `-0` has an **unnamed 11th column**: the billing date, first day of the month after the
  report month. The invoice bundles name the same column `Extract Date`.
- **Currency code `D` = USD** (PSK-1941; the invoice text prints USD throughout).

## Naming

Prefix every table `bloomberg_sid_`. `bloomberg_` namespaces the vendor so the invoice tables of
the later story (`bloomberg_invoice_*`) and other market-data feeds sit beside it; `sid_` names
the file family. The one exception is `bloomberg_firmwide_accounts`: the firmwide account is the
relationship both file families hang off, so it carries no file-family infix.

## Conventions shared by all tables

Follows `org_units` / `contract_cost_allocations` (migrations `20260824120000`,
`20260824130000`):

- `id bigint generated by default as identity` PK, `organization_id uuid not null` →
  `organizations(id) on delete cascade`, `created_at timestamptz not null default now()`.
- `UNIQUE (organization_id, id)` on every table that is a composite-FK target, so child rows pin
  tenancy through `(organization_id, parent_id)` FKs.
- Every child table hangs off `bloomberg_sid_reports` with `ON DELETE CASCADE`, and reports hang
  off `bloomberg_firmwide_accounts` the same way. Re-importing a month = delete its report row,
  insert again. No upsert logic anywhere.
- RLS follows `contract_owners`: authenticated gets SELECT scoped to its organization; writes
  arrive on the service role (the importer), so there are no write policies.
- Audit trigger on `bloomberg_firmwide_accounts` and `bloomberg_sid_reports` only: fact rows are
  bulk-imported, so the vendor decision and the report row are the audit units.
- Identifiers: `cust_num`, `firmwide_id` and `sid` are `bigint` (Bloomberg zero-pads all of them
  to fixed width, i.e. treats them as numbers); `sid_inst_num` is `integer`.
- Columns are named after the CSV header, snake-cased, and every header maps to a column. Codes
  with unknown semantics are stored as delivered (small integers or text), never interpreted.

## Tables

### `bloomberg_firmwide_accounts` — one row per Bloomberg firmwide account the organization holds

| column        | type    | source                            | notes                                                                                     |
| ------------- | ------- | --------------------------------- | ----------------------------------------------------------------------------------------- |
| `firmwide_id` | bigint  | `-0` `New Cust`, file-name prefix | 28929 in the sample                                                                       |
| `vendor_id`   | integer | chosen at first upload            | → `vendors(id)`, not null. Stored as chosen; readers resolve merges via `current_vendors` |

Unique `(organization_id, firmwide_id)`; that pair is the composite-FK target for reports, so a
report can only cite an account of its own organization. Why the vendor lives here and how it is
chosen: _Vendor association_ below.

### `bloomberg_sid_reports` — one row per imported month per firmwide ID

| column         | type      | source                            | notes                                                               |
| -------------- | --------- | --------------------------------- | ------------------------------------------------------------------- |
| `firmwide_id`  | bigint    | `-0` `New Cust`, file-name prefix | 28929 in the sample; every account row carries it                   |
| `report_month` | date      | folder name / upload              | first of the activity month (`2026-02-01`); no file column holds it |
| `billing_date` | date      | `-0` unnamed col 11               | first of the following month (`2026-03-01`)                         |
| `imported_by`  | uuid null | importer                          | → `users(id) on delete set null`                                    |

Unique `(organization_id, firmwide_id, report_month)`. `(organization_id, firmwide_id)` →
`bloomberg_firmwide_accounts`, cascade, so the account row (and its vendor) must exist before the
first month is imported.

`integration_sync_logs` is not reused: it is keyed on the connector `integration_provider` enum
and a Nango connection, and this is a file upload. The report row _is_ the import record, and
the historical "go back in time" view in the ticket is a `report_month` filter.

### `bloomberg_sid_report_files` — the eight source files of a report, as uploaded

PSK-1941 asks for a Documents tab where users view and download the original firmwide SID files.

| column         | type     | notes                                             |
| -------------- | -------- | ------------------------------------------------- |
| `report_id`    | bigint   | `(organization_id, report_id)` → reports, cascade |
| `file_index`   | smallint | 0–7, the `N` in the file name                     |
| `file_name`    | text     | as uploaded, e.g. `28929-2_anonymisiert.csv`      |
| `storage_path` | text     | Supabase Storage object path                      |
| `byte_size`    | integer  |                                                   |
| `sha256`       | text     | detects a re-upload of identical files            |
| `row_count`    | integer  | data rows parsed (0 for header-only `-5`/`-6`)    |

Unique `(report_id, file_index)`. All eight are stored, including `-1` and `-3`.

### `bloomberg_sid_accounts` — from `-0`, one row per legal entity / billing account per report

| column          | type         | source     | notes                                                                                                                                           |
| --------------- | ------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_id`     | bigint       |            | `(organization_id, report_id)` → reports, cascade                                                                                               |
| `cust_num`      | bigint       | `Cust Num` | 715298, 30041555, …                                                                                                                             |
| `name`          | text         | `Name`     | legal entity billed, e.g. `JOH BERENBERG GOSSLER & CO KG`                                                                                       |
| `firmwide_id`   | bigint       | `New Cust` | equals `reports.firmwide_id`; kept because every field is stored                                                                                |
| `city`          | text         | `City`     |                                                                                                                                                 |
| `state`         | text null    | `State`    | only US / CH rows have one                                                                                                                      |
| `country`       | text         | `Ctry`     | ISO-2                                                                                                                                           |
| `currency_code` | text         | `Curr`     | `D` = USD                                                                                                                                       |
| `tax_rate`      | numeric(7,4) | `Tax`      | VAT %: 8.1, 19, 20, 0, 6.25, 8.875, 9.25                                                                                                        |
| `auto`          | smallint     | `Auto`     | product note: automated server/API fetch indicator (B-PIPE-style machine traffic vs. terminal). Observed: `2` on all 20 accounts in every month |
| `term`          | smallint     | `Term`     | product note: terminal feed / pricing-rule indicator for Data License compliance. Observed: `2` on all 20 accounts                              |

Unique `(report_id, cust_num)`; this is the composite-FK target for every fact table, so a fact
row can only reference an account that the same month's `-0` lists (_verified_ to hold for `-2`,
`-4`, `-7`).

Snapshot per report rather than a dimension table: it is 20 rows, keeps the import purely
additive, and preserves changes to tax rate or entity name over time for free.

### `bloomberg_sid_subscriptions` — from `-2`, one row per SID instance in the month-end snapshot

| column             | type          | source             | notes                                                                                                                                                                                                                  |
| ------------------ | ------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_id`        | bigint        |                    | → reports, cascade                                                                                                                                                                                                     |
| `cust_num`         | bigint        | `Cust Num`         | `(report_id, cust_num)` → accounts                                                                                                                                                                                     |
| `sid`              | bigint        | `SID`              |                                                                                                                                                                                                                        |
| `sid_inst_num`     | integer       | `SID Inst Num`     | `(sid, sid_inst_num)` is unique within a month (_verified_)                                                                                                                                                            |
| `contract_date`    | date          | `Contract Date`    |                                                                                                                                                                                                                        |
| `renewal_date`     | date          | `Renewal Date`     | subscription period varies per seat                                                                                                                                                                                    |
| `last_user`        | text          | `Last User`        | the person on the seat. Anonymised in the sample, but the anonymiser kept categories: `user 830_zrh`, `leaver_24`, `PROXYUSER …`, `BCM`, `MIDDLEOFFICE` — so real files carry names, leavers and shared/proxy accounts |
| `sid_type`         | smallint      | `SID Type`         | 1 Subscription · 5 Limited Functionality · 6 Bloomberg Access Point · 12 Market Data                                                                                                                                   |
| `sid_description`  | text          | `SID Description`  | label for `sid_type`, stored as sent                                                                                                                                                                                   |
| `gptt`             | smallint      | `GPTT`             | product code: 28 Bloomberg Anywhere · 9 Open Bloomberg · 104 Market Data User · 83 Limited Function · 44 Access Point · 21 Open Bloomberg w/PC · 115 · 155                                                             |
| `gptt_description` | text          | `GPTT Description` |                                                                                                                                                                                                                        |
| `serial_number`    | text          | `SN/UUID`          | stays with the SID when `last_user` changes (_verified_), so it is the install's serial, not the user's UUID                                                                                                           |
| `ws`               | smallint null | `WS`               | product note: workstation identifier. Observed: `0` exactly on workstation-bound products (GPTT 9, 21, 44, 155) and `?` on every Anywhere-type product (28, 83, 104, 115) (_verified_)                                 |
| `ninety_day`       | boolean       | `90 Day`           | `*` → true. Product note: rolling 90-day window indicator. Observed: 4–5 rows per month, on `Free` Limited-Function seats (GPTT 83) plus two Anywhere seats in Feb; no relation to renewal-date proximity (_verified_) |
| `special`          | text null     | `Special`          | `Free` or empty                                                                                                                                                                                                        |
| `price`            | numeric(12,2) | `Price`            | monthly price: 2215 / 2360 / 2380 / 2500 / 2665; 0 = waiver/trial. Matches the invoice bundle's `Unit Price`                                                                                                           |
| `dual_inst_num`    | integer null  | `Dual Inst Num`    | always `?` in the sample                                                                                                                                                                                               |
| `dual_cust_num`    | bigint null   | `Dual Cust Num`    | always `?` in the sample                                                                                                                                                                                               |
| `po_number`        | text null     | `PO Number`        | empty, `N/A`, `NA` seen; kept as typed                                                                                                                                                                                 |

Unique `(report_id, sid, sid_inst_num)`. Index `(organization_id, sid, sid_inst_num)` for tracking
one seat across months, and `(report_id, cust_num)`.

Month-over-month in the sample: Feb→Mar 8 added, 9 removed, 47 changed. Changes are renewals
(`renewal_date` +2 years, `price` 2215→2360) and user reassignment (`last_user`).

### `bloomberg_sid_changes` — from `-7`, one row per change-activity line

| column                          | type               | source                          | notes                                                                                                                                                                                                    |
| ------------------------------- | ------------------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_id`                     | bigint             |                                 | → reports, cascade                                                                                                                                                                                       |
| `cust_num`                      | bigint             | `Cust Num`                      | `(report_id, cust_num)` → accounts                                                                                                                                                                       |
| `activity_date`                 | date               | `Date`                          | always inside the report month (_verified_)                                                                                                                                                              |
| `activity_time`                 | time               | `Time`                          |                                                                                                                                                                                                          |
| `is_start`                      | boolean            | `Start`                         | `Yes` / `No`                                                                                                                                                                                             |
| `is_stop`                       | boolean            | `Stop`                          | always the complement of `is_start` in the sample; kept as its own column because every field is stored                                                                                                  |
| `sid`                           | bigint             | `SID`                           |                                                                                                                                                                                                          |
| `sid_inst_num`                  | integer            | `SID Inst Num`                  |                                                                                                                                                                                                          |
| `order_num`                     | bigint             | `Order Num`                     |                                                                                                                                                                                                          |
| `line`                          | integer            | `Line`                          | always 100                                                                                                                                                                                               |
| `type_description`              | text               | `Type Description`              | `ContractSwap` · `Relo-Add` · `Relo-Remove` · `Removal` · `Conversion` · `ConversionRm` · `Add-On`                                                                                                       |
| `code`                          | integer            | `Code`                          | product / material code: 844 Bloomberg Anywhere · 304 Customers CRT Display · 845 BLP Access Point · 2798 App Portal Developer BBA · 2593 TOMS Developer BBA License. A different code space from `gptt` |
| `description`                   | text               | `Description`                   |                                                                                                                                                                                                          |
| `po_number`                     | text null          | `PO Number`                     |                                                                                                                                                                                                          |
| `special`                       | text null          | `Special`                       | `Free`                                                                                                                                                                                                   |
| `from_cust_num`                 | bigint null        | `From Cust Num`                 | set on Start rows of a move                                                                                                                                                                              |
| `from_completion_date`          | date null          | `From Completion Date`          |                                                                                                                                                                                                          |
| `to_cust_num`                   | bigint null        | `To Cust Num`                   | set on Stop rows of a move                                                                                                                                                                               |
| `to_completion_date`            | date null          | `To Completion Date`            |                                                                                                                                                                                                          |
| `subscription_billthru_date`    | date null          | `Subscription Billthru Date`    | end of the billed quarter (`03/31/26`, `06/30/26`)                                                                                                                                                       |
| `subscription_related_sid`      | bigint null        | `Subscription Related SID`      | zero-padded in the file                                                                                                                                                                                  |
| `subscription_related_inst_num` | integer null       | `Subscription Related Inst Num` |                                                                                                                                                                                                          |
| `subscription_related_cust_num` | bigint null        | `Subscription Related Cust Num` |                                                                                                                                                                                                          |
| `subscription_amount`           | numeric(12,2) null | `Subscription Amount`           | signed prorated credit (−) or charge (+) on the quarter's invoice, e.g. −4356.17 / +4356.17                                                                                                              |
| `hardware_billthru_date`        | date null          | `Hardware Billthru Date`        | all five hardware columns are `?` throughout the sample                                                                                                                                                  |
| `hardware_related_sid`          | bigint null        | `Hardware Related SID`          |                                                                                                                                                                                                          |
| `hardware_related_inst_num`     | integer null       | `Hardware Related Inst Num`     |                                                                                                                                                                                                          |
| `hardware_related_cust_num`     | bigint null        | `Hardware Related Cust Num`     |                                                                                                                                                                                                          |
| `hardware_amount`               | numeric(12,2) null | `Hardware Amount`               |                                                                                                                                                                                                          |

Unique `(report_id, order_num, line, sid, sid_inst_num)` (_verified_; `(order_num, line)` alone
repeats because a `ContractSwap` books both sides under one order). No row recurs in a later
month (_verified_). Index `(organization_id, sid, sid_inst_num)`.

Reading the rows: a swap or relocation produces a Stop row on the old `(cust_num, sid_inst_num)`
and a Start row on the new one, linked through `order_num` and the `*_related_*` columns.
`Removal` rows have no counterpart. `Conversion` / `ConversionRm` pairs change the product
(`code` 844 → 304) on the same SID with a bumped instance number. The ticket defers the Changes
tabs, but the table is loaded now so the month-over-month history is complete from day one.

### `bloomberg_sid_exchange_fees` — from `-4` summary rows (width 8) and admin rows (width 6)

| column              | type               | source                      | notes                                                                                                                                                                              |
| ------------------- | ------------------ | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_id`         | bigint             |                             | → reports, cascade                                                                                                                                                                 |
| `cust_num`          | bigint             | `Cust Num`                  | `(report_id, cust_num)` → accounts                                                                                                                                                 |
| `rpt_month`         | date               | `Rpt Month`                 | month billed. In the Feb report ~90 % of rows carry `03/01/26` (next month, billed in advance) and ~10 % `02/01/26` (current-month catch-up). Distinct from `reports.report_month` |
| `fee_kind`          | text               | derived from row shape      | `exchange` (width-8 rows) or `admin` (width-6 rows under the `Exchange Administration Fees` header)                                                                                |
| `exchange_code`     | text               | `Exchange`                  | `DUBL`, `EAIP`, `ARCL`, … ; admin rows use `ADM5` … `ADM95`                                                                                                                        |
| `exchange_name`     | text               | `Name`                      | `Euronext Dublin Equities`; admin rows `Enablement Fee NYSE`                                                                                                                       |
| `subscriptions`     | integer            | `Subscriptions`             | number of SIDs entitled; `2.000` → 2, always integral (_verified_)                                                                                                                 |
| `currency_code`     | text null          | `Currency`                  | `D`; absent on admin rows                                                                                                                                                          |
| `total_price`       | numeric(12,2) null | `Total Price`               | **null = `\***`**, exchange bills the client directly. Admin rows always equal `subscriptions` (1.00 per entitlement, _verified_)                                                  |
| `contributor_bills` | boolean            | `Contributor Bills` (col 8) | `*` → true (~72 of 472 exchange rows per month). Does not coincide with `***` row-for-row (`ARCL` has both, `JPEM` has only the mask), so both are stored                          |

Check `fee_kind in ('exchange', 'admin')`. Unique `(report_id, cust_num, rpt_month, exchange_code)`.

_Verified_: for every unmasked group `total_price` equals the sum of its lines' `pro_rate`, and a
group is masked exactly when at least one of its lines is masked. The summary is stored anyway
because it is what Bloomberg reports and what reconciles against the invoice.

### `bloomberg_sid_exchange_fee_lines` — from `-4` detail rows (width 13), one per SID under an exchange

| column              | type               | source                       | notes                                                                                                             |
| ------------------- | ------------------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `fee_id`            | bigint             |                              | `(organization_id, fee_id)` → exchange_fees, cascade                                                              |
| `sid`               | bigint             | `SID`                        |                                                                                                                   |
| `sid_inst_num`      | integer            | `SID Inst Num`               |                                                                                                                   |
| `pro_rate`          | numeric(12,2) null | `Pro Rate`                   | this SID's share of `total_price`; null = masked                                                                  |
| `contributor_bills` | boolean            | `Contributor Bills` (col 10) |                                                                                                                   |
| `eid_number`        | integer            | `EID Number`                 | Bloomberg entitlement ID. 1:1 with `exchange_code` in the sample (168 distinct) but stored where the file puts it |

Unique `(fee_id, sid, sid_inst_num)`. Index `(organization_id, sid, sid_inst_num)`.

No FK to `bloomberg_sid_subscriptions`: 2 of 199 `(sid, sid_inst_num)` pairs in February's fees
are absent from February's inventory (swapped mid-month; the inventory is a month-end snapshot).
The Permissions tab joins the two on `(sid, sid_inst_num)` in code.

### `bloomberg_sid_research_purchases` — from `-5`, one row per research document transaction

Header-only in all three sample months, so types are inferred from the header names and every
non-key column is nullable until a real file confirms the shape.

| column                    | type          | source                         |
| ------------------------- | ------------- | ------------------------------ |
| `report_id`               | bigint        | → reports, cascade             |
| `cust_num`                | bigint        | `Cust Num` → accounts          |
| `rpt_month`               | date          | `Rpt Month`                    |
| `research_report_id`      | text          | `Research report ID`           |
| `title`                   | text          | `Research Report Title`        |
| `publish_date`            | date          | `Research report publish date` |
| `analyst_name`            | text          | `Analyst name`                 |
| `asset_class`             | text          | `Research asset class`         |
| `industry`                | text          | `Industry`                     |
| `region`                  | text          | `Region`                       |
| `price_per_document`      | numeric(12,2) | `Price per document`           |
| `volume_purchased`        | integer       | `Volume purchased`             |
| `transaction_date`        | date          | `Transaction date`             |
| `transaction_id`          | text          | `Transaction ID`               |
| `consumer_company_name`   | text          | `Consumer Company name`        |
| `consumer_company_number` | bigint        | `Consumer company number`      |
| `purchaser_name`          | text          | `Purchaser Name`               |
| `purchaser_uuid`          | text          | `UUID of Purchaser`            |
| `research_class_name`     | text          | `Research class name`          |
| `memo`                    | text          | `Memo`                         |

No natural key is verifiable yet; `transaction_id` is the likely candidate. Index `(report_id, cust_num)`.

### `bloomberg_sid_material_charges` — from `-6`, one row per material / hardware charge

Same caveat: header-only in the sample.

| column          | type          | source                |
| --------------- | ------------- | --------------------- |
| `report_id`     | bigint        | → reports, cascade    |
| `cust_num`      | bigint        | `Cust Num` → accounts |
| `rpt_month`     | date          | `Rpt Month`           |
| `quantity`      | integer       | `Quantity`            |
| `material`      | text          | `Material`            |
| `description`   | text          | `Description`         |
| `total_price`   | numeric(12,2) | `Total Price`         |
| `currency_code` | text          | `Currency`            |
| `start_date`    | date          | `StartDate`           |
| `end_date`      | date          | `EndDate`             |
| `username`      | text          | `Username`            |

Index `(report_id, cust_num)`.

## Relationship to the existing model

- `organization_id` on every table. No FKs to `org_employees`, `org_units` or `contracts`; the
  tables hold the files as delivered. The vendor link is on the firmwide account only.
- Module gating ("turn on/off per org, charged separately") is an admin-app concern outside this
  schema, as with cost allocation.
- The invoice bundles become `bloomberg_invoice_*` tables in the reconciliation story and join
  on `(sid, sid_inst_num)`.

### Vendor association

Assessed 2026-09-03 against prod (read-only, demo orgs excluded via `organizations.is_demo_org`).

**Why the link cannot be inferred.** `vendors` is global, unique by name, with no org column. Prod
holds seven active Bloomberg rows, none merged into another: three spellings of Bloomberg Finance
L.P. (27, 310, 469), plain "Bloomberg" (194), "Bloomberg International SL" (129, demo orgs only),
Bloomberg Data Management Services (382) and Bloomberg Second Measure (754). Terminal products sit
under 27, 194, 310 and 469. Of 36 real orgs, 9 have Bloomberg contracts and 3 of those contract with
several Bloomberg rows at once (one with four). A new customer has no Bloomberg contract at all. So
"the org's Bloomberg vendor" has several answers for real customers and none for new ones, and the
SID files cannot break the tie: the `-0` accounts are the customer's legal entities, and no column
names the Bloomberg entity that bills.

**Where it lives.** One decision per firmwide account, on `bloomberg_firmwide_accounts.vendor_id`,
made at first upload and editable later. Every monthly report inherits it through the FK, a
re-import never re-decides, and an org with two Bloomberg relationships (say a US and a UK firmwide
ID billed by different entities) maps each to its own vendor row. A nullable `vendor_id` on the
report row would also work but pushes the decision onto every upload and records nothing at the
account level.

**How the upload flow chooses.** Vendor rows are never created for this: `vendors.name` is unique
platform-wide and every Bloomberg entity already has a row, so "create Bloomberg Finance L.P." would
collide. The flow links to an existing global row:

1. Collect the org's Bloomberg vendors: rows with domain `bloomberg.com` reached through the org's
   contracts, plus `organization_vendor_settings` rows for the org.
2. Exactly one → default to it. Several or none → show the global `bloomberg.com` rows to pick from.
3. On confirm, insert the account row and an `organization_vendor_settings` row for
   `(organization_id, vendor_id)` if missing, so the vendor counts as the org's before any contract
   exists. That table is the only contract-free org↔vendor link in the schema (composite PK, jsonb
   `settings`, today carrying only the DORA `ict_provider` flag); it is written by AI-extraction
   vendor creation and the ICT toggle and covers about four in five org-vendor pairs, so it is a
   precedent for the shape, not a registry to rely on.

**Merges.** `vendors.merged_into_vendor_id` plus the `current_vendors` view canonicalise merged
vendors, but only the older data layer resolves through it; `lib/v2` and the vendor detail fetch use
raw ids. The account stores the id as chosen; SID readers must resolve through `current_vendors` so a
future Bloomberg corporate action does not orphan the link.

**Follow-ups outside this schema.** Rows 27, 310 and 469 are one legal entity and all in real use;
a vendor merge is due and will otherwise show as three near-identical picker entries. The Inngest
extraction path calls `getVendorId` with two arguments, so its organization id lands in the address
slot and that path never creates a vendor.

### Join keys available for code-side mapping

Attribution (entity, employee, spend) is built in code and UI on these columns:

| SID data                           | matches                                                                       | notes                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `accounts.name`, `city`, `country` | `org_employees.entity`, `region`/`country`; the `entity` level of `org_units` | account = legal entity + location                                               |
| `subscriptions.last_user`          | employee name                                                                 | real files carry names plus leavers and shared/proxy accounts (see column note) |
| `subscriptions.cust_num`           | roll-up key for all costs                                                     | every SID belongs to exactly one account                                        |
| `(sid, sid_inst_num)`              | across `subscriptions`, `changes`, `exchange_fee_lines`, invoice lines        | the seat identity through time                                                  |

## Import rules

1. Resolve the firmwide account first: `firmwide_id` from the file-name prefix, cross-checked
   against `-0` `New Cust`. If `bloomberg_firmwide_accounts` has no row for
   `(organization_id, firmwide_id)`, choose the vendor (see _Vendor association_) and insert it;
   the report FK refuses an import without one.
2. One import = one folder (or the folder inside the uploaded zip) = one `bloomberg_sid_reports`
   row. `report_month` comes from the upload; `billing_date` from `-0` column 11.
3. Store all eight files in Supabase Storage first and record them in
   `bloomberg_sid_report_files`; parsing works from the stored copies.
4. Strip NULs; sniff delimiter (`,` vs `;`) and date format per file.
5. `-0` → accounts. `-2` → subscriptions. `-7` → changes (drop the two-column placeholder rows).
   `-4` → exchange fees by row width: 8 = exchange summary, 6 = admin fee, 13 = line attached to
   the most recent summary row, 2 = section marker / placeholder (drop). `-5` → research
   purchases, `-6` → material charges.
6. `?` → null everywhere; `***` → null on the two price columns; `*` → true on flag columns;
   `Yes`/`No` → boolean.
7. Parse and insert inside one transaction; on any row failure the whole month rolls back.
   Re-import = delete the report row (cascade) and run again.
8. `-1` and `-3` are stored but not parsed. Optionally assert `-1 ⊆ -7` and `-3 ⊆ -4`.

## Open questions

1. `Auto` and `Term` are constant (`2`) across all 20 accounts and `90 Day` marks Free
   Limited-Function seats, which does not match the product note's descriptions (machine-traffic
   indicator, terminal pricing rule, money-market window). Stored as delivered either way; worth
   confirming with Bloomberg before any UI interprets them.
2. Is the semicolon + `DD.MM.YYYY` format of `-2` Bloomberg's original or an anonymisation
   artefact? Confirm against a raw export before locking the parser.
3. Is the `SID Report MM_YYYY` folder labelling Berenberg's or Bloomberg's (ticket open
   question)? It decides whether `report_month` can be read from the upload or must be asked for.
