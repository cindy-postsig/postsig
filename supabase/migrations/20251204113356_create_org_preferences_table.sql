-- Migration: 20251204113356_create_org_preferences_table.sql
-- Create org_preferences table for scalable organization notification preferences

create table "public"."org_preferences" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "preference_key" text not null,
    "preference_value" jsonb not null,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."org_preferences" enable row level security;

CREATE UNIQUE INDEX org_preferences_org_id_preference_key_key ON public.org_preferences USING btree (organization_id, preference_key);

CREATE INDEX org_preferences_organization_id_idx ON public.org_preferences USING btree (organization_id);

CREATE UNIQUE INDEX org_preferences_pkey ON public.org_preferences USING btree (id);

CREATE INDEX org_preferences_preference_key_idx ON public.org_preferences USING btree (preference_key);

alter table "public"."org_preferences" add constraint "org_preferences_pkey" PRIMARY KEY using index "org_preferences_pkey";

alter table "public"."org_preferences" add constraint "org_preferences_org_id_preference_key_key" UNIQUE using index "org_preferences_org_id_preference_key_key";

alter table "public"."org_preferences" add constraint "org_preferences_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."org_preferences" validate constraint "org_preferences_organization_id_fkey";

CREATE OR REPLACE FUNCTION public.update_org_preferences_updated_at()
 RETURNS trigger
 AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

create policy "Enable all for authenticated users"
on "public"."org_preferences"
as permissive
for all
to authenticated
using (true)
with check (true);


CREATE TRIGGER trigger_update_org_preferences_updated_at BEFORE UPDATE ON public.org_preferences FOR EACH ROW EXECUTE FUNCTION update_org_preferences_updated_at();


