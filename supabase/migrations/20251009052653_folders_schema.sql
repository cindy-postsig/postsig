-- Create folders table
create table "public"."folders" (
    "name" text,
    "organization_id" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "user_ids" uuid[] default '{}'::uuid[],
    "group_ids" uuid[] default '{}'::uuid[],
    "owner_id" uuid,
    "id" uuid not null default gen_random_uuid(),
    "slug" text not null
);

alter table "public"."folders" enable row level security;

-- Add folder_id to contracts table
alter table "public"."contracts" add column "folder_id" uuid;

-- Create indexes
CREATE UNIQUE INDEX folders_organization_slug_unique ON public.folders USING btree (organization_id, slug);

CREATE UNIQUE INDEX folders_pkey ON public.folders USING btree (id);

CREATE INDEX idx_folders_org_slug ON public.folders USING btree (organization_id, slug);

-- Add primary key constraint
alter table "public"."folders" add constraint "folders_pkey" PRIMARY KEY using index "folders_pkey";

-- Add foreign key constraints
alter table "public"."contracts" add constraint "contracts_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES folders(id) not valid;

alter table "public"."contracts" validate constraint "contracts_folder_id_fkey";

alter table "public"."folders" add constraint "folders_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."folders" validate constraint "folders_organization_id_fkey";

alter table "public"."folders" add constraint "folders_organization_slug_unique" UNIQUE using index "folders_organization_slug_unique";

alter table "public"."folders" add constraint "folders_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES users(id) not valid;

alter table "public"."folders" validate constraint "folders_owner_id_fkey";

-- Grant permissions on folders table
grant select on table "public"."folders" to "authenticated";

grant insert on table "public"."folders" to "authenticated";

grant all on table "public"."folders" to "service_role";

-- RLS Policies for folders
create policy "Users can view folders in their organization"
on "public"."folders"
as permissive
for select
to authenticated
using (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);

create policy "Users can create folders in their organization"
on "public"."folders"
as permissive
for insert
to authenticated
with check (
  organization_id IN (
    SELECT organization_id FROM users WHERE id = auth.uid()
  )
);
