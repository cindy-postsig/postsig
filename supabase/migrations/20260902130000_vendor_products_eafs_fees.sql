-- Exchange Agreement fee-schedule fees, keyed one-to-one to the vendor
-- product row they price. An EAFeeSchedule contract publishes a fee for a
-- product as-is, over whatever period that exchange quotes (monthly for
-- some, annual for others); period_months records that span so the report
-- can prorate it to the invoice's billing frequency. When an EAINV product
-- pairs with an EASO owner, the report uses this row's product_fee as the
-- expected fee instead of the SO row's fees.
--
-- Not user-entered: no user_id, no organization_id. Tenancy follows the
-- referenced product row, so RLS is scoped through
-- vendor_products_details.contract_id, mirroring contract_owners_read
-- (20260828120000_contract_owners.sql).

create table public.vendor_products_eafs_fees (
    id bigint generated always as identity primary key,
    vpd_id bigint not null
        references public.vendor_products_details(id) on delete cascade,
    product_fee numeric not null,
    period_months smallint not null default 1 check (period_months > 0),
    created_at timestamptz not null default now()
);

create unique index vendor_products_eafs_fees_vpd_id_key
    on public.vendor_products_eafs_fees (vpd_id);

comment on table public.vendor_products_eafs_fees is 'Exchange Agreement fee-schedule fee for a vendor product row, as published, over the period period_months covers. Not user-entered; one row per product row.';
comment on column public.vendor_products_eafs_fees.vpd_id is 'The priced product row (vendor_products_details.id); unique, one fee-schedule row per product row';
comment on column public.vendor_products_eafs_fees.product_fee is 'Fee-schedule fee as published, for the span period_months covers';
comment on column public.vendor_products_eafs_fees.period_months is 'Months the product_fee covers (1 = monthly price, 12 = annual price); varies per exchange';

create trigger audit_vendor_products_eafs_fees_trigger
    after insert or delete or update on public.vendor_products_eafs_fees
    for each row execute function audit_trigger_function();

-- Reads are scoped to contracts the user can see via the referenced product
-- row; writes arrive on the service role, which bypasses RLS.
alter table public.vendor_products_eafs_fees enable row level security;

grant select on public.vendor_products_eafs_fees to authenticated;

create policy "vendor_products_eafs_fees_read" on public.vendor_products_eafs_fees
    for select
    to authenticated
    using (
        vpd_id in (
            select vpd.id
            from public.vendor_products_details vpd
            where vpd.contract_id in (
                select id from contracts_visible_to(
                    (select organization_id from public.users where id = (select auth.uid())),
                    (select auth.uid())
                )
            )
        )
    );

create policy "vendor_products_eafs_fees_anon_deny" on public.vendor_products_eafs_fees
    for all
    to anon
    using (false);
