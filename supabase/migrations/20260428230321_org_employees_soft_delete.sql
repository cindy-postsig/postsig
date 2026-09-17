-- =============================================================================
-- org_employees: add soft-delete via deleted_at
-- =============================================================================

alter table "public"."org_employees"
    add column "deleted_at" timestamp with time zone;

-- Replace partial unique email index so soft-deleted rows do not block re-adds
drop index if exists "public"."org_employees_org_email_unique";

create unique index org_employees_org_email_unique
    on public.org_employees
    using btree (organization_id, lower(email))
    where email is not null and deleted_at is null;

-- Active-row partial index for fast list queries
create index idx_org_employees_active
    on public.org_employees
    using btree (organization_id)
    where deleted_at is null;
