create type organization_status as enum ('active', 'inactive');

alter table organizations
  add column status organization_status not null default 'active';

comment on column organizations.status is
  'Lifecycle state of the org. Inactive orgs are excluded from scheduled emails (e.g. monthly budget intelligence) and other active-org-only workflows.';
