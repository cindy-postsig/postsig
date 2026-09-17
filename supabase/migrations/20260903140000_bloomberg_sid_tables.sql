-- PSK-1941: Bloomberg module, the monthly firmwide SID file set as tables.
--
-- Standalone by design: organization-scoped copies of the eight CSVs Bloomberg
-- delivers per firmwide account, one column per CSV header, no foreign keys
-- into org_employees / org_units / contracts. Attribution to entities,
-- employees and spend is built in code on top of these. The one link outward
-- is the vendor: each firmwide account names the vendors row it is booked
-- under (bloomberg_firmwide_accounts), and every report hangs off an account.
--
-- Everything hangs off bloomberg_sid_reports with on delete cascade, so a
-- month is re-imported by deleting its report row and inserting again; no
-- upsert path exists. Fact tables also carry (report_id, cust_num) against
-- bloomberg_sid_accounts, so a row can only cite an account that the same
-- month's -0 file lists.
--
-- Design and the verified file facts: docs/bloomberg-sid-schema-design.md

-- =============================================================================
-- bloomberg_firmwide_accounts: one row per Bloomberg firmwide account the
-- organization holds, and the vendors row it is booked under
-- =============================================================================

-- The SID files never name the Bloomberg legal entity that bills the account,
-- and the global vendors table carries several Bloomberg rows that real
-- organizations contract with side by side, so the vendor is a decision made
-- once per firmwide account (at first upload, editable later), never inferred
-- per file. No sid_ infix: the quarterly invoice bundles hang off the same
-- account.
create table public.bloomberg_firmwide_accounts (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    firmwide_id bigint not null,
    vendor_id integer not null,
    created_at timestamptz not null default now(),
    -- Composite-FK target for reports, so a report can only cite an account
    -- of its own organization.
    constraint bloomberg_firmwide_accounts_unique unique (organization_id, firmwide_id),
    constraint bloomberg_firmwide_accounts_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_firmwide_accounts_vendor_id_fkey
        foreign key (vendor_id) references public.vendors(id)
);

comment on table public.bloomberg_firmwide_accounts is 'A Bloomberg firmwide (group) account held by the organization and the vendors row it is booked under (PSK-1941). Reports cascade from it.';
comment on column public.bloomberg_firmwide_accounts.firmwide_id is 'Bloomberg top-level group account number: the "New Cust" column of file -0 and the SID file-name prefix.';
comment on column public.bloomberg_firmwide_accounts.vendor_id is 'The vendors row this relationship is booked under, as chosen for the organization. Stored as chosen; readers resolve merges through current_vendors.';

-- Choosing or changing the vendor is the decision worth auditing.
create trigger audit_bloomberg_firmwide_accounts_trigger
    after insert or delete or update on public.bloomberg_firmwide_accounts
    for each row execute function audit_trigger_function();

-- =============================================================================
-- bloomberg_sid_reports: one row per imported month per firmwide ID
-- =============================================================================

create table public.bloomberg_sid_reports (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    firmwide_id bigint not null,
    report_month date not null,
    billing_date date not null,
    imported_by uuid,
    created_at timestamptz not null default now(),
    constraint bloomberg_sid_reports_report_month_check check (extract(day from report_month) = 1),
    constraint bloomberg_sid_reports_month_unique unique (organization_id, firmwide_id, report_month),
    -- Composite-FK target so every child pins tenancy (contract_owners pattern).
    constraint bloomberg_sid_reports_org_id_unique unique (organization_id, id),
    constraint bloomberg_sid_reports_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_reports_imported_by_fkey
        foreign key (imported_by) references public.users(id) on delete set null,
    constraint bloomberg_sid_reports_firmwide_account_fkey
        foreign key (organization_id, firmwide_id) references public.bloomberg_firmwide_accounts(organization_id, firmwide_id) on delete cascade
);

comment on table public.bloomberg_sid_reports is 'One imported monthly Bloomberg firmwide SID file set (PSK-1941). Children cascade from it; re-import = delete and insert again.';
comment on column public.bloomberg_sid_reports.firmwide_id is 'Bloomberg top-level group account: the "New Cust" column of file -0 and the file-name prefix.';
comment on column public.bloomberg_sid_reports.report_month is 'First day of the activity month the set covers. Taken from the upload, no file column holds it.';
comment on column public.bloomberg_sid_reports.billing_date is 'Unnamed last column of file -0: first day of the month being billed, the month after report_month.';

-- Fact rows are bulk-imported thousands at a time; the report row is their
-- audit unit, so none of them carries a trigger of its own.
create trigger audit_bloomberg_sid_reports_trigger
    after insert or delete or update on public.bloomberg_sid_reports
    for each row execute function audit_trigger_function();

-- =============================================================================
-- bloomberg_sid_report_files: the eight uploaded CSVs of a report, for the
-- Documents tab and for re-parsing without asking the client again
-- =============================================================================

create table public.bloomberg_sid_report_files (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    report_id bigint not null,
    file_index smallint not null,
    file_name text not null,
    storage_path text not null,
    byte_size integer not null,
    sha256 text not null,
    row_count integer not null,
    created_at timestamptz not null default now(),
    constraint bloomberg_sid_report_files_index_check check (file_index between 0 and 7),
    constraint bloomberg_sid_report_files_sha256_check check (sha256 ~ '^[0-9a-f]{64}$'),
    constraint bloomberg_sid_report_files_unique unique (report_id, file_index),
    constraint bloomberg_sid_report_files_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_report_files_report_fkey
        foreign key (organization_id, report_id) references public.bloomberg_sid_reports(organization_id, id) on delete cascade
);

create index idx_bloomberg_sid_report_files_organization on public.bloomberg_sid_report_files (organization_id);

comment on table public.bloomberg_sid_report_files is 'The eight source CSVs of a report as uploaded (all of them, including the redundant -1 and -3), stored in Supabase Storage.';
comment on column public.bloomberg_sid_report_files.file_index is 'The N in <firmwide id>-<N>_*.csv, 0 to 7.';
comment on column public.bloomberg_sid_report_files.row_count is 'Data rows parsed from the file; 0 for a header-only file.';

-- =============================================================================
-- bloomberg_sid_accounts: file -0, one legal entity / billing account per report
-- =============================================================================

create table public.bloomberg_sid_accounts (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    report_id bigint not null,
    cust_num bigint not null,
    name text not null,
    firmwide_id bigint not null,
    city text not null,
    state text,
    country text not null,
    currency_code text not null,
    tax_rate numeric(7,4) not null,
    auto smallint not null,
    term smallint not null,
    -- Also the composite-FK target for every fact table's (report_id, cust_num).
    constraint bloomberg_sid_accounts_unique unique (report_id, cust_num),
    constraint bloomberg_sid_accounts_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_accounts_report_fkey
        foreign key (organization_id, report_id) references public.bloomberg_sid_reports(organization_id, id) on delete cascade
);

create index idx_bloomberg_sid_accounts_organization on public.bloomberg_sid_accounts (organization_id);

comment on table public.bloomberg_sid_accounts is 'File -0: the legal entities / billing accounts (Cust Num) under the firmwide ID, snapshotted per report.';
comment on column public.bloomberg_sid_accounts.currency_code is 'Bloomberg currency code; D = USD.';
comment on column public.bloomberg_sid_accounts.tax_rate is 'VAT percent for the billing location.';
comment on column public.bloomberg_sid_accounts.auto is 'Bloomberg "Auto" code, stored as delivered. Product note calls it an automated server/API fetch indicator; the sample shows 2 on every account.';
comment on column public.bloomberg_sid_accounts.term is 'Bloomberg "Term" code, stored as delivered. Product note calls it a terminal feed / pricing-rule indicator; the sample shows 2 on every account.';

-- =============================================================================
-- bloomberg_sid_subscriptions: file -2, one row per SID instance (terminal
-- seat install) in the month-end snapshot
-- =============================================================================

create table public.bloomberg_sid_subscriptions (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    report_id bigint not null,
    cust_num bigint not null,
    sid bigint not null,
    sid_inst_num integer not null,
    contract_date date not null,
    renewal_date date not null,
    last_user text not null,
    sid_type smallint not null,
    sid_description text not null,
    gptt smallint not null,
    gptt_description text not null,
    serial_number text not null,
    ws smallint,
    ninety_day boolean not null default false,
    special text,
    price numeric(12,2) not null,
    dual_inst_num integer,
    dual_cust_num bigint,
    po_number text,
    constraint bloomberg_sid_subscriptions_unique unique (report_id, sid, sid_inst_num),
    constraint bloomberg_sid_subscriptions_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_subscriptions_report_fkey
        foreign key (organization_id, report_id) references public.bloomberg_sid_reports(organization_id, id) on delete cascade,
    constraint bloomberg_sid_subscriptions_account_fkey
        foreign key (report_id, cust_num) references public.bloomberg_sid_accounts(report_id, cust_num) on delete cascade
);

create index idx_bloomberg_sid_subscriptions_account on public.bloomberg_sid_subscriptions (report_id, cust_num);
-- One seat across months: (sid, sid_inst_num) is Bloomberg's key for an install.
create index idx_bloomberg_sid_subscriptions_seat on public.bloomberg_sid_subscriptions (organization_id, sid, sid_inst_num);

comment on table public.bloomberg_sid_subscriptions is 'File -2: every SID instance (terminal seat install) present at month end, with its price, renewal date and assigned user.';
comment on column public.bloomberg_sid_subscriptions.sid_inst_num is 'Install counter of the SID; bumps on relocation or swap. (sid, sid_inst_num) identifies one seat through time.';
comment on column public.bloomberg_sid_subscriptions.last_user is 'The person on the seat as Bloomberg records it. Real files also carry leavers and shared/proxy accounts.';
comment on column public.bloomberg_sid_subscriptions.gptt is 'Bloomberg product code: 28 Bloomberg Anywhere, 9 Open Bloomberg, 104 Market Data User, 83 Limited Function, 44 Access Point.';
comment on column public.bloomberg_sid_subscriptions.serial_number is 'The "SN/UUID" column. Stays with the SID when last_user changes, so it is the install serial, not the user UUID.';
comment on column public.bloomberg_sid_subscriptions.ws is 'The "WS" column, null where the file says "?". 0 on workstation-bound products (Open Bloomberg, Access Point), absent on Anywhere-type seats.';
comment on column public.bloomberg_sid_subscriptions.ninety_day is 'The "90 Day" column, true where the file shows "*". Product note: rolling 90-day window indicator; the sample marks Free Limited-Function seats.';
comment on column public.bloomberg_sid_subscriptions.price is 'Monthly seat price in the account currency; 0 = waiver or trial.';

-- =============================================================================
-- bloomberg_sid_changes: file -7, one row per subscription change-activity
-- line (file -1 is the same rows without the ten billing columns)
-- =============================================================================

create table public.bloomberg_sid_changes (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    report_id bigint not null,
    cust_num bigint not null,
    activity_date date not null,
    activity_time time not null,
    is_start boolean not null,
    is_stop boolean not null,
    sid bigint not null,
    sid_inst_num integer not null,
    order_num bigint not null,
    line integer not null,
    type_description text not null,
    code integer not null,
    description text not null,
    po_number text,
    special text,
    from_cust_num bigint,
    from_completion_date date,
    to_cust_num bigint,
    to_completion_date date,
    subscription_billthru_date date,
    subscription_related_sid bigint,
    subscription_related_inst_num integer,
    subscription_related_cust_num bigint,
    subscription_amount numeric(12,2),
    hardware_billthru_date date,
    hardware_related_sid bigint,
    hardware_related_inst_num integer,
    hardware_related_cust_num bigint,
    hardware_amount numeric(12,2),
    -- (order_num, line) alone repeats: a ContractSwap books both seats under one order.
    constraint bloomberg_sid_changes_unique unique (report_id, order_num, line, sid, sid_inst_num),
    constraint bloomberg_sid_changes_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_changes_report_fkey
        foreign key (organization_id, report_id) references public.bloomberg_sid_reports(organization_id, id) on delete cascade,
    constraint bloomberg_sid_changes_account_fkey
        foreign key (report_id, cust_num) references public.bloomberg_sid_accounts(report_id, cust_num) on delete cascade
);

create index idx_bloomberg_sid_changes_account on public.bloomberg_sid_changes (report_id, cust_num);
create index idx_bloomberg_sid_changes_seat on public.bloomberg_sid_changes (organization_id, sid, sid_inst_num);

comment on table public.bloomberg_sid_changes is 'File -7: subscription change activity in the month (swaps, relocations, removals, conversions) with the prorated billing impact.';
comment on column public.bloomberg_sid_changes.type_description is 'ContractSwap, Relo-Add, Relo-Remove, Removal, Conversion, ConversionRm, Add-On.';
comment on column public.bloomberg_sid_changes.code is 'Bloomberg product / material code (844 Bloomberg Anywhere, 304 CRT Display, ...). A different code space from subscriptions.gptt.';
comment on column public.bloomberg_sid_changes.subscription_amount is 'Signed prorated credit (negative) or charge (positive) on the quarter invoice.';

-- =============================================================================
-- bloomberg_sid_exchange_fees: file -4 summary rows, one per account x billed
-- month x exchange product (or administration fee)
-- =============================================================================

create table public.bloomberg_sid_exchange_fees (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    report_id bigint not null,
    cust_num bigint not null,
    rpt_month date not null,
    fee_kind text not null,
    exchange_code text not null,
    exchange_name text not null,
    subscriptions integer not null,
    currency_code text,
    total_price numeric(12,2),
    contributor_bills boolean not null default false,
    constraint bloomberg_sid_exchange_fees_kind_check check (fee_kind in ('exchange', 'admin')),
    constraint bloomberg_sid_exchange_fees_unique unique (report_id, cust_num, rpt_month, exchange_code),
    constraint bloomberg_sid_exchange_fees_org_id_unique unique (organization_id, id),
    constraint bloomberg_sid_exchange_fees_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_exchange_fees_report_fkey
        foreign key (organization_id, report_id) references public.bloomberg_sid_reports(organization_id, id) on delete cascade,
    constraint bloomberg_sid_exchange_fees_account_fkey
        foreign key (report_id, cust_num) references public.bloomberg_sid_accounts(report_id, cust_num) on delete cascade
);

comment on table public.bloomberg_sid_exchange_fees is 'File -4 summary rows: one exchange entitlement product (or ADM* administration fee) per account and billed month, with the total across its SIDs.';
comment on column public.bloomberg_sid_exchange_fees.rpt_month is 'Month billed. Mostly the month after report_month (billed in advance), sometimes the report month itself (catch-up).';
comment on column public.bloomberg_sid_exchange_fees.fee_kind is 'exchange = an exchange product row; admin = an Enablement Fee row from the Exchange Administration Fees section.';
comment on column public.bloomberg_sid_exchange_fees.total_price is 'Null where the file shows "***": Bloomberg pipes the data through without charging and the exchange bills the client directly.';
comment on column public.bloomberg_sid_exchange_fees.contributor_bills is 'The "Contributor Bills" flag ("*"). Does not coincide with a masked price row for row, so both are kept.';

-- =============================================================================
-- bloomberg_sid_exchange_fee_lines: file -4 detail rows, one SID under an
-- exchange product with its share of the total
-- =============================================================================

create table public.bloomberg_sid_exchange_fee_lines (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    fee_id bigint not null,
    sid bigint not null,
    sid_inst_num integer not null,
    pro_rate numeric(12,2),
    contributor_bills boolean not null default false,
    eid_number integer not null,
    constraint bloomberg_sid_exchange_fee_lines_unique unique (fee_id, sid, sid_inst_num),
    constraint bloomberg_sid_exchange_fee_lines_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_exchange_fee_lines_fee_fkey
        foreign key (organization_id, fee_id) references public.bloomberg_sid_exchange_fees(organization_id, id) on delete cascade
);

-- No FK to subscriptions on purpose: a seat swapped mid-month is billed here
-- but absent from the month-end inventory. Joined in code on (sid, sid_inst_num).
create index idx_bloomberg_sid_exchange_fee_lines_seat on public.bloomberg_sid_exchange_fee_lines (organization_id, sid, sid_inst_num);

comment on table public.bloomberg_sid_exchange_fee_lines is 'File -4 detail rows: the SIDs entitled to an exchange product and each one''s prorated share of the fee.';
comment on column public.bloomberg_sid_exchange_fee_lines.pro_rate is 'This SID''s share of the parent total_price; null where the file shows "***".';
comment on column public.bloomberg_sid_exchange_fee_lines.eid_number is 'Bloomberg entitlement ID of the exchange product.';

-- =============================================================================
-- bloomberg_sid_research_purchases: file -5. Header-only in every sample
-- month, so types come from the header names and non-key columns stay
-- nullable until a real file confirms the shape.
-- =============================================================================

create table public.bloomberg_sid_research_purchases (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    report_id bigint not null,
    cust_num bigint not null,
    rpt_month date,
    research_report_id text,
    title text,
    publish_date date,
    analyst_name text,
    asset_class text,
    industry text,
    region text,
    price_per_document numeric(12,2),
    volume_purchased integer,
    transaction_date date,
    transaction_id text,
    consumer_company_name text,
    consumer_company_number bigint,
    purchaser_name text,
    purchaser_uuid text,
    research_class_name text,
    memo text,
    constraint bloomberg_sid_research_purchases_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_research_purchases_report_fkey
        foreign key (organization_id, report_id) references public.bloomberg_sid_reports(organization_id, id) on delete cascade,
    constraint bloomberg_sid_research_purchases_account_fkey
        foreign key (report_id, cust_num) references public.bloomberg_sid_accounts(report_id, cust_num) on delete cascade
);

create index idx_bloomberg_sid_research_purchases_account on public.bloomberg_sid_research_purchases (report_id, cust_num);
create index idx_bloomberg_sid_research_purchases_organization on public.bloomberg_sid_research_purchases (organization_id);

comment on table public.bloomberg_sid_research_purchases is 'File -5: research document purchases. Column types are inferred from the header only; no sample file had rows.';

-- =============================================================================
-- bloomberg_sid_material_charges: file -6, same caveat as file -5
-- =============================================================================

create table public.bloomberg_sid_material_charges (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    report_id bigint not null,
    cust_num bigint not null,
    rpt_month date,
    quantity integer,
    material text,
    description text,
    total_price numeric(12,2),
    currency_code text,
    start_date date,
    end_date date,
    username text,
    constraint bloomberg_sid_material_charges_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint bloomberg_sid_material_charges_report_fkey
        foreign key (organization_id, report_id) references public.bloomberg_sid_reports(organization_id, id) on delete cascade,
    constraint bloomberg_sid_material_charges_account_fkey
        foreign key (report_id, cust_num) references public.bloomberg_sid_accounts(report_id, cust_num) on delete cascade
);

create index idx_bloomberg_sid_material_charges_account on public.bloomberg_sid_material_charges (report_id, cust_num);
create index idx_bloomberg_sid_material_charges_organization on public.bloomberg_sid_material_charges (organization_id);

comment on table public.bloomberg_sid_material_charges is 'File -6: material / hardware charges. Column types are inferred from the header only; no sample file had rows.';

-- =============================================================================
-- RLS. Reads are scoped to the caller's organization; writes arrive on the
-- service role (the importer), which bypasses RLS, so authenticated gets
-- SELECT and nothing else and no write policy is needed. Mirrors
-- contract_owners / contract_lineage_events.
-- =============================================================================

alter table public.bloomberg_firmwide_accounts enable row level security;
grant select on public.bloomberg_firmwide_accounts to authenticated;
create policy "bloomberg_firmwide_accounts_read" on public.bloomberg_firmwide_accounts
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_firmwide_accounts_anon_deny" on public.bloomberg_firmwide_accounts
    for all to anon using (false);

alter table public.bloomberg_sid_reports enable row level security;
grant select on public.bloomberg_sid_reports to authenticated;
create policy "bloomberg_sid_reports_read" on public.bloomberg_sid_reports
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_reports_anon_deny" on public.bloomberg_sid_reports
    for all to anon using (false);

alter table public.bloomberg_sid_report_files enable row level security;
grant select on public.bloomberg_sid_report_files to authenticated;
create policy "bloomberg_sid_report_files_read" on public.bloomberg_sid_report_files
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_report_files_anon_deny" on public.bloomberg_sid_report_files
    for all to anon using (false);

alter table public.bloomberg_sid_accounts enable row level security;
grant select on public.bloomberg_sid_accounts to authenticated;
create policy "bloomberg_sid_accounts_read" on public.bloomberg_sid_accounts
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_accounts_anon_deny" on public.bloomberg_sid_accounts
    for all to anon using (false);

alter table public.bloomberg_sid_subscriptions enable row level security;
grant select on public.bloomberg_sid_subscriptions to authenticated;
create policy "bloomberg_sid_subscriptions_read" on public.bloomberg_sid_subscriptions
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_subscriptions_anon_deny" on public.bloomberg_sid_subscriptions
    for all to anon using (false);

alter table public.bloomberg_sid_changes enable row level security;
grant select on public.bloomberg_sid_changes to authenticated;
create policy "bloomberg_sid_changes_read" on public.bloomberg_sid_changes
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_changes_anon_deny" on public.bloomberg_sid_changes
    for all to anon using (false);

alter table public.bloomberg_sid_exchange_fees enable row level security;
grant select on public.bloomberg_sid_exchange_fees to authenticated;
create policy "bloomberg_sid_exchange_fees_read" on public.bloomberg_sid_exchange_fees
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_exchange_fees_anon_deny" on public.bloomberg_sid_exchange_fees
    for all to anon using (false);

alter table public.bloomberg_sid_exchange_fee_lines enable row level security;
grant select on public.bloomberg_sid_exchange_fee_lines to authenticated;
create policy "bloomberg_sid_exchange_fee_lines_read" on public.bloomberg_sid_exchange_fee_lines
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_exchange_fee_lines_anon_deny" on public.bloomberg_sid_exchange_fee_lines
    for all to anon using (false);

alter table public.bloomberg_sid_research_purchases enable row level security;
grant select on public.bloomberg_sid_research_purchases to authenticated;
create policy "bloomberg_sid_research_purchases_read" on public.bloomberg_sid_research_purchases
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_research_purchases_anon_deny" on public.bloomberg_sid_research_purchases
    for all to anon using (false);

alter table public.bloomberg_sid_material_charges enable row level security;
grant select on public.bloomberg_sid_material_charges to authenticated;
create policy "bloomberg_sid_material_charges_read" on public.bloomberg_sid_material_charges
    for select to authenticated
    using (organization_id = (select organization_id from public.users where id = (select auth.uid())));
create policy "bloomberg_sid_material_charges_anon_deny" on public.bloomberg_sid_material_charges
    for all to anon using (false);
