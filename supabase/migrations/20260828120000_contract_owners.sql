-- PSK-1975: contract owners get their own table.
--
-- Three concepts, three stores, nothing derived from another: sharing groups
-- (contract_acl_group / folder_acl_group) say who may see a contract, cost
-- allocations say how its spend is attributed, and this table says who is
-- responsible for it. Until now the Owner tab's Business Group field wrote
-- ACL rows, then (#2145) cost allocations, so a field that documents
-- ownership granted access and invented financial attribution.
--
-- Ids only, never names: display names come from the embed, so renames
-- propagate and deletions cascade. A sponsor is a PostSig user, an HR
-- employee, or a bare label when the person is in neither list; a group is an
-- org_unit at any level, flat cost centres included.
--
-- contracts.business_sponsor is frozen at its pre-migration value as the
-- rollback record: no writer, no reader, not dropped here.

create table public.contract_owners (
    id bigint generated always as identity primary key,
    organization_id uuid not null,
    contract_id bigint not null,
    role text not null,
    user_id uuid,
    org_employee_id bigint,
    label text,
    org_unit_id bigint,
    created_at timestamptz not null default now(),
    created_by uuid,
    constraint contract_owners_role_check check (role in ('sponsor', 'group')),
    constraint contract_owners_shape_check check (
        (role = 'sponsor' and num_nonnulls(user_id, org_employee_id, label) = 1 and org_unit_id is null)
        or (role = 'group' and org_unit_id is not null and num_nonnulls(user_id, org_employee_id, label) = 0)
    ),
    constraint contract_owners_label_check check (label is null or (label = btrim(label) and label <> '')),
    constraint contract_owners_organization_id_fkey
        foreign key (organization_id) references public.organizations(id) on delete cascade,
    -- Composite tenancy FKs, the cost-allocation tables' pattern: a cross-org
    -- reference is a constraint violation, not an RLS gap. Every
    -- (organization_id, id) target already exists: contracts_org_id_unique /
    -- org_employees_org_id_unique (20260824130000), org_units_org_id_unique
    -- (20260824120000), users_org_id_unique (20251029152248).
    constraint contract_owners_contract_fkey
        foreign key (organization_id, contract_id) references public.contracts(organization_id, id) on delete cascade,
    constraint contract_owners_user_fkey
        foreign key (organization_id, user_id) references public.users(organization_id, id) on delete cascade,
    constraint contract_owners_org_employee_fkey
        foreign key (organization_id, org_employee_id) references public.org_employees(organization_id, id) on delete cascade,
    -- Cascade from org_units is deliberate, the opposite of the allocation
    -- lines' NO ACTION: owner rows are documentation, not financial rows.
    constraint contract_owners_org_unit_fkey
        foreign key (organization_id, org_unit_id) references public.org_units(organization_id, id) on delete cascade,
    -- Who acted, which is not a tenancy edge.
    constraint contract_owners_created_by_fkey
        foreign key (created_by) references public.users(id) on delete set null
);

-- One partial unique per arm. The label one is on lower(label), so "Acme" and
-- "ACME" collide in the database rather than relying on every write path to
-- dedupe.
create unique index contract_owners_user_unique
    on public.contract_owners (contract_id, user_id) where user_id is not null;
create unique index contract_owners_org_employee_unique
    on public.contract_owners (contract_id, org_employee_id) where org_employee_id is not null;
create unique index contract_owners_label_unique
    on public.contract_owners (contract_id, lower(label)) where label is not null;
create unique index contract_owners_org_unit_unique
    on public.contract_owners (contract_id, org_unit_id) where org_unit_id is not null;

create index idx_contract_owners_contract on public.contract_owners (contract_id);
create index idx_contract_owners_organization on public.contract_owners (organization_id);
create index idx_contract_owners_user on public.contract_owners (user_id) where user_id is not null;
create index idx_contract_owners_org_employee on public.contract_owners (org_employee_id) where org_employee_id is not null;
create index idx_contract_owners_org_unit on public.contract_owners (org_unit_id) where org_unit_id is not null;

comment on table public.contract_owners is 'Who is responsible for a contract (PSK-1975). Ownership only: grants no access and attributes no spend. Sponsors reference a user, an HR employee, or carry a bare label; groups reference an org_unit at any level.';
comment on column public.contract_owners.role is 'sponsor = a person (exactly one of user_id / org_employee_id / label); group = an org_unit';
comment on column public.contract_owners.label is 'Sponsor name typed by hand when the person is neither a user nor an employee; trimmed, unique per contract case-insensitively';

create trigger audit_contract_owners_trigger
    after insert or delete or update on public.contract_owners
    for each row execute function audit_trigger_function();

-- Reads are scoped to contracts the user can see; writes arrive on the service
-- role (updateOwner, MCP update_contract, the populate runner), which bypasses
-- RLS, so authenticated gets SELECT and nothing else and no write policy is
-- needed. Mirrors contract_lineage_events.
alter table public.contract_owners enable row level security;

grant select on public.contract_owners to authenticated;

create policy "contract_owners_read" on public.contract_owners
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

create policy "contract_owners_anon_deny" on public.contract_owners
    for all
    to anon
    using (false);
