-- Invoice credits table

create table public.contract_product_credits (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    contract_id bigint not null,
    product_id bigint not null,
    year integer not null,
    amount numeric not null,
    sort_order integer,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    created_by uuid,
    constraint contract_product_credits_amount_check check (amount >= 0),
    constraint contract_product_credits_year_check check (year >= 1),
    constraint contract_product_credits_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    constraint contract_product_credits_contract_fkey
        foreign key (organization_id, contract_id) references public.contracts(organization_id, id) on delete cascade,
    constraint contract_product_credits_product_fkey
        foreign key (product_id) references public.vendor_products(id) on delete cascade,
    constraint contract_product_credits_created_by_fkey
        foreign key (created_by) references public.users(id) on delete set null
);

create index idx_contract_product_credits_contract on public.contract_product_credits (contract_id);
create index idx_contract_product_credits_organization on public.contract_product_credits (organization_id);
create index idx_contract_product_credits_product on public.contract_product_credits (product_id);

comment on table public.contract_product_credits is 'Credit lines on an invoice: an amount the vendor deducts from what is owed, linked to the product it credits. Only written for invoice contract types. Kept out of vendor_products_details so no spend, budget, allocation or reconciliation path picks credits up implicitly.';
comment on column public.contract_product_credits.amount is 'The credit magnitude, always positive. Rendered negative and totalled separately; never added to the products total.';
comment on column public.contract_product_credits.year is 'Relative year within the contract term, matching vendor_products_details.year, so a credit groups with the product lines it offsets. Not a calendar year and not a fiscal year.';
comment on column public.contract_product_credits.sort_order is 'Display order within a year, assigned on write from the row order the extractor approved.';

create trigger audit_contract_product_credits_trigger
    after insert or delete or update on public.contract_product_credits
    for each row execute function audit_trigger_function();

alter table public.contract_product_credits enable row level security;

grant select on public.contract_product_credits to authenticated;

create policy "contract_product_credits_read" on public.contract_product_credits
    for select
    to authenticated
    using (
        contract_id in (
            select id from contracts_visible_to(
                (select organization_id from public.users where id = (select auth.uid())),
                (select auth.uid())
            )
        )
    );

create policy "contract_product_credits_anon_deny" on public.contract_product_credits
    for all
    to anon
    using (false);
