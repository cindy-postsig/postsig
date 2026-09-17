-- Create feature_flags table
create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  environment text not null,
  enabled boolean not null default false,
  rules jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint feature_flags_key_environment_unique unique (key, environment)
);

-- Enable Row Level Security
alter table feature_flags enable row level security;

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger feature_flags_updated_at
  before update on feature_flags
  for each row
  execute function update_updated_at();

  create table feature_flag_attributes (
    id          uuid primary key default gen_random_uuid(),
    key         text not null unique,
    type        text not null check (type in ('string','number','boolean','enum','entity')),
    values      text[],                                  -- enum only; null otherwise
    entity      text check (entity in ('user','org')),    -- entity only; null otherwise
    system      boolean not null default false,           -- seeded + locked in the UI
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    constraint ffa_enum_has_values
      check (type <> 'enum' or (values is not null and array_length(values,1) > 0)),
    constraint ffa_entity_has_entity
      check ((type = 'entity') = (entity is not null))
  );

  create trigger feature_flag_attributes_updated_at
    before update on feature_flag_attributes
    for each row
    execute function update_updated_at();

  insert into feature_flag_attributes (key, type, entity, system) values
    ('userId',         'entity', 'user', true),
    ('organizationId', 'entity', 'org',  true);
