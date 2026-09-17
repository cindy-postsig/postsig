create type "public"."permission_level" as enum ('read', 'write', 'admin');

create sequence "public"."folders_id_seq";

create sequence "public"."groups_id_seq";

drop policy "User can see their own rows" on "public"."contracts";

drop policy "Users can create a row" on "public"."contracts";

drop policy "Users can update contracts in their org" on "public"."contracts";

drop policy "Users can update their own rows" on "public"."contracts";

create table "public"."contract_acl_group" (
    "organization_id" uuid not null,
    "contract_id" bigint not null,
    "group_id" bigint not null,
    "perm" permission_level not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."contract_acl_group" enable row level security;

create table "public"."contract_acl_user" (
    "organization_id" uuid not null,
    "contract_id" bigint not null,
    "user_id" uuid not null,
    "perm" permission_level not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."contract_acl_user" enable row level security;

create table "public"."folder_acl_group" (
    "organization_id" uuid not null,
    "folder_id" bigint not null,
    "group_id" bigint not null,
    "perm" permission_level not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."folder_acl_group" enable row level security;

create table "public"."folder_acl_user" (
    "organization_id" uuid not null,
    "folder_id" bigint not null,
    "user_id" uuid not null,
    "perm" permission_level not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."folder_acl_user" enable row level security;

create table "public"."folder_contracts" (
    "folder_id" bigint not null,
    "contract_id" bigint not null,
    "organization_id" uuid not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."folder_contracts" enable row level security;

create table "public"."folders" (
    "id" bigint not null default nextval('folders_id_seq'::regclass),
    "public_uuid" uuid not null default gen_random_uuid(),
    "parent_id" bigint,
    "name" text not null,
    "path" ltree not null,
    "organization_id" uuid not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."folders" enable row level security;

create table "public"."group_members" (
    "organization_id" uuid not null,
    "group_id" bigint not null,
    "user_id" uuid not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."group_members" enable row level security;

create table "public"."groups" (
    "id" bigint not null default nextval('groups_id_seq'::regclass),
    "public_uuid" uuid not null default gen_random_uuid(),
    "name" text not null,
    "organization_id" uuid not null,
    "created_at" timestamp with time zone default now()
);


alter table "public"."groups" enable row level security;

alter table "public"."contracts" add column "organization_id" uuid;

alter sequence "public"."folders_id_seq" owned by "public"."folders"."id";

alter sequence "public"."groups_id_seq" owned by "public"."groups"."id";

CREATE UNIQUE INDEX contract_acl_group_pkey ON public.contract_acl_group USING btree (organization_id, contract_id, group_id, perm);

CREATE UNIQUE INDEX contract_acl_user_pkey ON public.contract_acl_user USING btree (organization_id, contract_id, user_id, perm);

CREATE UNIQUE INDEX folder_acl_group_pkey ON public.folder_acl_group USING btree (organization_id, folder_id, group_id, perm);

CREATE UNIQUE INDEX folder_acl_user_pkey ON public.folder_acl_user USING btree (organization_id, folder_id, user_id, perm);

CREATE UNIQUE INDEX folder_contracts_pkey ON public.folder_contracts USING btree (folder_id, contract_id);

CREATE UNIQUE INDEX folders_organization_name_parent_unique ON public.folders USING btree (organization_id, parent_id, name);

CREATE UNIQUE INDEX folders_pkey ON public.folders USING btree (id);

CREATE UNIQUE INDEX folders_public_uuid_key ON public.folders USING btree (public_uuid);

CREATE UNIQUE INDEX group_members_pkey ON public.group_members USING btree (organization_id, group_id, user_id);

CREATE UNIQUE INDEX groups_pkey ON public.groups USING btree (id);

CREATE UNIQUE INDEX groups_public_uuid_key ON public.groups USING btree (public_uuid);

CREATE INDEX idx_caclg_org_group_contract ON public.contract_acl_group USING btree (organization_id, group_id, contract_id);

CREATE INDEX idx_caclu_org_user_contract ON public.contract_acl_user USING btree (organization_id, user_id, contract_id);

CREATE INDEX idx_contracts_org ON public.contracts USING btree (organization_id);

CREATE INDEX idx_faclg_org_group_folder ON public.folder_acl_group USING btree (organization_id, group_id, folder_id);

CREATE INDEX idx_faclu_org_user_folder ON public.folder_acl_user USING btree (organization_id, user_id, folder_id);

CREATE INDEX idx_folder_contracts_contract ON public.folder_contracts USING btree (contract_id);

CREATE INDEX idx_folder_contracts_folder ON public.folder_contracts USING btree (folder_id);

CREATE INDEX idx_folder_contracts_org_contract ON public.folder_contracts USING btree (organization_id, contract_id);

CREATE INDEX idx_folder_contracts_org_folder ON public.folder_contracts USING btree (organization_id, folder_id);

CREATE INDEX idx_folders_org ON public.folders USING btree (organization_id);

CREATE INDEX idx_folders_parent ON public.folders USING btree (parent_id);

CREATE INDEX idx_folders_path ON public.folders USING gist (path);

CREATE INDEX idx_folders_user ON public.folders USING btree (user_id);

CREATE INDEX idx_gm_org_group ON public.group_members USING btree (organization_id, group_id);

CREATE INDEX idx_gm_org_user ON public.group_members USING btree (organization_id, user_id);

CREATE UNIQUE INDEX idx_groups_org_name_lower ON public.groups USING btree (organization_id, lower(name));

alter table "public"."contract_acl_group" add constraint "contract_acl_group_pkey" PRIMARY KEY using index "contract_acl_group_pkey";

alter table "public"."contract_acl_user" add constraint "contract_acl_user_pkey" PRIMARY KEY using index "contract_acl_user_pkey";

alter table "public"."folder_acl_group" add constraint "folder_acl_group_pkey" PRIMARY KEY using index "folder_acl_group_pkey";

alter table "public"."folder_acl_user" add constraint "folder_acl_user_pkey" PRIMARY KEY using index "folder_acl_user_pkey";

alter table "public"."folder_contracts" add constraint "folder_contracts_pkey" PRIMARY KEY using index "folder_contracts_pkey";

alter table "public"."folders" add constraint "folders_pkey" PRIMARY KEY using index "folders_pkey";

alter table "public"."group_members" add constraint "group_members_pkey" PRIMARY KEY using index "group_members_pkey";

alter table "public"."groups" add constraint "groups_pkey" PRIMARY KEY using index "groups_pkey";

alter table "public"."contract_acl_group" add constraint "contract_acl_group_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;

alter table "public"."contract_acl_group" validate constraint "contract_acl_group_contract_id_fkey";

alter table "public"."contract_acl_group" add constraint "contract_acl_group_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE not valid;

alter table "public"."contract_acl_group" validate constraint "contract_acl_group_group_id_fkey";

alter table "public"."contract_acl_group" add constraint "contract_acl_group_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."contract_acl_group" validate constraint "contract_acl_group_organization_id_fkey";

alter table "public"."contract_acl_user" add constraint "contract_acl_user_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;

alter table "public"."contract_acl_user" validate constraint "contract_acl_user_contract_id_fkey";

alter table "public"."contract_acl_user" add constraint "contract_acl_user_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."contract_acl_user" validate constraint "contract_acl_user_organization_id_fkey";

alter table "public"."contract_acl_user" add constraint "contract_acl_user_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."contract_acl_user" validate constraint "contract_acl_user_user_id_fkey";

alter table "public"."contracts" add constraint "contracts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."contracts" validate constraint "contracts_organization_id_fkey";

alter table "public"."folder_acl_group" add constraint "folder_acl_group_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE not valid;

alter table "public"."folder_acl_group" validate constraint "folder_acl_group_folder_id_fkey";

alter table "public"."folder_acl_group" add constraint "folder_acl_group_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE not valid;

alter table "public"."folder_acl_group" validate constraint "folder_acl_group_group_id_fkey";

alter table "public"."folder_acl_group" add constraint "folder_acl_group_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."folder_acl_group" validate constraint "folder_acl_group_organization_id_fkey";

alter table "public"."folder_acl_user" add constraint "folder_acl_user_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE not valid;

alter table "public"."folder_acl_user" validate constraint "folder_acl_user_folder_id_fkey";

alter table "public"."folder_acl_user" add constraint "folder_acl_user_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."folder_acl_user" validate constraint "folder_acl_user_organization_id_fkey";

alter table "public"."folder_acl_user" add constraint "folder_acl_user_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."folder_acl_user" validate constraint "folder_acl_user_user_id_fkey";

alter table "public"."folder_contracts" add constraint "folder_contracts_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;

alter table "public"."folder_contracts" validate constraint "folder_contracts_contract_id_fkey";

alter table "public"."folder_contracts" add constraint "folder_contracts_folder_id_fkey" FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE not valid;

alter table "public"."folder_contracts" validate constraint "folder_contracts_folder_id_fkey";

alter table "public"."folder_contracts" add constraint "folder_contracts_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."folder_contracts" validate constraint "folder_contracts_organization_id_fkey";

alter table "public"."folders" add constraint "folders_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."folders" validate constraint "folders_organization_id_fkey";

alter table "public"."folders" add constraint "folders_organization_name_parent_unique" UNIQUE using index "folders_organization_name_parent_unique";

alter table "public"."folders" add constraint "folders_parent_id_fkey" FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE not valid;

alter table "public"."folders" validate constraint "folders_parent_id_fkey";

alter table "public"."folders" add constraint "folders_public_uuid_key" UNIQUE using index "folders_public_uuid_key";

alter table "public"."folders" add constraint "folders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."folders" validate constraint "folders_user_id_fkey";

alter table "public"."group_members" add constraint "group_members_group_id_fkey" FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE not valid;

alter table "public"."group_members" validate constraint "group_members_group_id_fkey";

alter table "public"."group_members" add constraint "group_members_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."group_members" validate constraint "group_members_organization_id_fkey";

alter table "public"."group_members" add constraint "group_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."group_members" validate constraint "group_members_user_id_fkey";

alter table "public"."groups" add constraint "groups_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."groups" validate constraint "groups_organization_id_fkey";

alter table "public"."groups" add constraint "groups_public_uuid_key" UNIQUE using index "groups_public_uuid_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.assert_same_org_uuid(_org uuid, _tbl text, _bigint bigint)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare row_org uuid;
begin
  if _tbl = 'folders'      then select organization_id into row_org from public.folders     where id = _bigint;
  elsif _tbl = 'contracts' then select organization_id into row_org from public.contracts   where id = _bigint;
  else raise exception 'unknown table %', _tbl;
  end if;
  if row_org is null or row_org <> _org then
    raise exception 'organization mismatch for %', _tbl;
  end if;
end$function$
;

CREATE OR REPLACE FUNCTION public.contracts_visible_to(p_organization_id uuid, p_user_id uuid)
 RETURNS TABLE(id bigint, perm permission_level)
 LANGUAGE sql
 STABLE
AS $function$
with direct_perms as (
  select cu.contract_id as id, max(cu.perm) as perm
  from public.contract_acl_user cu
  where cu.organization_id = p_organization_id
    and cu.user_id = p_user_id
  group by cu.contract_id

  union all

  select cg.contract_id as id, max(cg.perm) as perm
  from public.contract_acl_group cg
  join public.group_members gm
    on gm.organization_id = p_organization_id
   and gm.group_id = cg.group_id
   and gm.user_id = p_user_id
  where cg.organization_id = p_organization_id
  group by cg.contract_id

  union all

  -- implicit owner-admin if your contracts.user_id is the owner
  select c.id, 'admin'::permission_level
  from public.contracts c
  where c.organization_id = p_organization_id
    and c.user_id = p_user_id
),
inherited_perms as (
  -- folder inheritance via ltree
  select fc.contract_id as id,
         max(coalesce(fau.perm, fag.perm)) as perm
  from public.folder_contracts fc
  join public.folders f_child
    on f_child.id = fc.folder_id
   and f_child.organization_id = p_organization_id
  left join public.folder_acl_user fau
    on fau.organization_id = p_organization_id
   and fau.user_id = p_user_id
  left join public.folders f_u on f_u.id = fau.folder_id
  left join public.group_members gm
    on gm.organization_id = p_organization_id
   and gm.user_id = p_user_id
  left join public.folder_acl_group fag
    on fag.organization_id = p_organization_id
   and fag.group_id = gm.group_id
  left join public.folders f_g on f_g.id = fag.folder_id
  where fc.organization_id = p_organization_id
    and ((f_u.path @> f_child.path) or (f_g.path @> f_child.path))
  group by fc.contract_id
),
all_perms as (
  select * from direct_perms
  union all
  select * from inherited_perms
)
select id, max(perm) as perm
from all_perms
group by id;
$function$
;

CREATE OR REPLACE FUNCTION public.folders_visible_to(p_organization_id uuid, p_user_id uuid)
 RETURNS TABLE(id bigint, perm permission_level)
 LANGUAGE sql
 STABLE
AS $function$
with user_grants as (
  select f.id, f.path, fau.perm
  from public.folder_acl_user fau
  join public.folders f
    on f.id = fau.folder_id
   and f.organization_id = p_organization_id
  where fau.organization_id = p_organization_id
    and fau.user_id = p_user_id
),
group_grants as (
  select f.id, f.path, fag.perm
  from public.folder_acl_group fag
  join public.group_members gm
    on gm.organization_id = p_organization_id
   and gm.group_id = fag.group_id
   and gm.user_id = p_user_id
  join public.folders f
    on f.id = fag.folder_id
   and f.organization_id = p_organization_id
  where fag.organization_id = p_organization_id
),
grant_nodes as (
  select * from user_grants
  union all
  select * from group_grants
),
inherited as (
  select f_child.id, max(gn.perm) as perm
  from public.folders f_child
  join grant_nodes gn
    on gn.path @> f_child.path
  where f_child.organization_id = p_organization_id
  group by f_child.id
),
all_perms as (
  select * from inherited
)
select id, max(perm) as perm
from all_perms
group by id;
$function$
;

CREATE OR REPLACE FUNCTION public.is_folder_admin(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  -- 11 folder-admin; 12/1/2 also qualify
  select public.user_has_role_in_org(p_user, p_org, array[11,12]::int[]);
$function$
;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  -- 12 supervisor; 1/2 legacy org admins
  select public.user_has_role_in_org(p_user, p_org, array[11,12]::int[]);
$function$
;

CREATE OR REPLACE FUNCTION public.reparent_update_subtree()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare old_path ltree; new_path ltree; parent_path ltree;
begin
  if old.parent_id is distinct from new.parent_id then
    old_path := old.path;

    if new.parent_id is null then
      new_path := ('n' || new.id::text)::ltree;
    else
      select path into parent_path from public.folders where id = new.parent_id;
      new_path := parent_path || ('n' || new.id::text)::ltree;
    end if;

    new.path := new_path;

    update public.folders f
       set path = new_path || subpath(f.path, nlevel(old_path))
     where f.path <@ old_path
       and f.id <> new.id;
  end if;
  return new;
end$function$
;

CREATE OR REPLACE FUNCTION public.set_path_before_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare parent_path ltree;
begin
  if new.parent_id is null then
    new.path := ('n' || new.id::text)::ltree;
  else
    select path into parent_path from public.folders where id = new.parent_id;
    new.path := parent_path || ('n' || new.id::text)::ltree;
  end if;
  return new;
end$function$
;

CREATE OR REPLACE FUNCTION public.trg_same_organization()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_table_name = 'folder_contracts' then
    perform public.assert_same_org_uuid(new.organization_id, 'folders',   new.folder_id);
    perform public.assert_same_org_uuid(new.organization_id, 'contracts', new.contract_id);
  elsif tg_table_name = 'folder_acl_user' then
    perform public.assert_same_org_uuid(new.organization_id, 'folders', new.folder_id);
  elsif tg_table_name = 'folder_acl_group' then
    perform public.assert_same_org_uuid(new.organization_id, 'folders', new.folder_id);
  elsif tg_table_name = 'contract_acl_user' then
    perform public.assert_same_org_uuid(new.organization_id, 'contracts', new.contract_id);
  elsif tg_table_name = 'contract_acl_group' then
    perform public.assert_same_org_uuid(new.organization_id, 'contracts', new.contract_id);
  end if;
  return new;
end$function$
;

CREATE OR REPLACE FUNCTION public.user_has_role_in_org(p_user uuid, p_org uuid, p_roles integer[])
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  select exists (
    select 1
    from public.users u
    join public.user_roles2 ur on ur.user_id = u.id
    where u.id = p_user
      and u.organization_id = p_org
      and ur.role_id = any(p_roles)
  );
$function$
;

grant delete on table "public"."contract_acl_group" to "anon";

grant insert on table "public"."contract_acl_group" to "anon";

grant references on table "public"."contract_acl_group" to "anon";

grant select on table "public"."contract_acl_group" to "anon";

grant trigger on table "public"."contract_acl_group" to "anon";

grant truncate on table "public"."contract_acl_group" to "anon";

grant update on table "public"."contract_acl_group" to "anon";

grant delete on table "public"."contract_acl_group" to "authenticated";

grant insert on table "public"."contract_acl_group" to "authenticated";

grant references on table "public"."contract_acl_group" to "authenticated";

grant select on table "public"."contract_acl_group" to "authenticated";

grant trigger on table "public"."contract_acl_group" to "authenticated";

grant truncate on table "public"."contract_acl_group" to "authenticated";

grant update on table "public"."contract_acl_group" to "authenticated";

grant delete on table "public"."contract_acl_group" to "service_role";

grant insert on table "public"."contract_acl_group" to "service_role";

grant references on table "public"."contract_acl_group" to "service_role";

grant select on table "public"."contract_acl_group" to "service_role";

grant trigger on table "public"."contract_acl_group" to "service_role";

grant truncate on table "public"."contract_acl_group" to "service_role";

grant update on table "public"."contract_acl_group" to "service_role";

grant delete on table "public"."contract_acl_user" to "anon";

grant insert on table "public"."contract_acl_user" to "anon";

grant references on table "public"."contract_acl_user" to "anon";

grant select on table "public"."contract_acl_user" to "anon";

grant trigger on table "public"."contract_acl_user" to "anon";

grant truncate on table "public"."contract_acl_user" to "anon";

grant update on table "public"."contract_acl_user" to "anon";

grant delete on table "public"."contract_acl_user" to "authenticated";

grant insert on table "public"."contract_acl_user" to "authenticated";

grant references on table "public"."contract_acl_user" to "authenticated";

grant select on table "public"."contract_acl_user" to "authenticated";

grant trigger on table "public"."contract_acl_user" to "authenticated";

grant truncate on table "public"."contract_acl_user" to "authenticated";

grant update on table "public"."contract_acl_user" to "authenticated";

grant delete on table "public"."contract_acl_user" to "service_role";

grant insert on table "public"."contract_acl_user" to "service_role";

grant references on table "public"."contract_acl_user" to "service_role";

grant select on table "public"."contract_acl_user" to "service_role";

grant trigger on table "public"."contract_acl_user" to "service_role";

grant truncate on table "public"."contract_acl_user" to "service_role";

grant update on table "public"."contract_acl_user" to "service_role";

grant delete on table "public"."folder_acl_group" to "anon";

grant insert on table "public"."folder_acl_group" to "anon";

grant references on table "public"."folder_acl_group" to "anon";

grant select on table "public"."folder_acl_group" to "anon";

grant trigger on table "public"."folder_acl_group" to "anon";

grant truncate on table "public"."folder_acl_group" to "anon";

grant update on table "public"."folder_acl_group" to "anon";

grant delete on table "public"."folder_acl_group" to "authenticated";

grant insert on table "public"."folder_acl_group" to "authenticated";

grant references on table "public"."folder_acl_group" to "authenticated";

grant select on table "public"."folder_acl_group" to "authenticated";

grant trigger on table "public"."folder_acl_group" to "authenticated";

grant truncate on table "public"."folder_acl_group" to "authenticated";

grant update on table "public"."folder_acl_group" to "authenticated";

grant delete on table "public"."folder_acl_group" to "service_role";

grant insert on table "public"."folder_acl_group" to "service_role";

grant references on table "public"."folder_acl_group" to "service_role";

grant select on table "public"."folder_acl_group" to "service_role";

grant trigger on table "public"."folder_acl_group" to "service_role";

grant truncate on table "public"."folder_acl_group" to "service_role";

grant update on table "public"."folder_acl_group" to "service_role";

grant delete on table "public"."folder_acl_user" to "anon";

grant insert on table "public"."folder_acl_user" to "anon";

grant references on table "public"."folder_acl_user" to "anon";

grant select on table "public"."folder_acl_user" to "anon";

grant trigger on table "public"."folder_acl_user" to "anon";

grant truncate on table "public"."folder_acl_user" to "anon";

grant update on table "public"."folder_acl_user" to "anon";

grant delete on table "public"."folder_acl_user" to "authenticated";

grant insert on table "public"."folder_acl_user" to "authenticated";

grant references on table "public"."folder_acl_user" to "authenticated";

grant select on table "public"."folder_acl_user" to "authenticated";

grant trigger on table "public"."folder_acl_user" to "authenticated";

grant truncate on table "public"."folder_acl_user" to "authenticated";

grant update on table "public"."folder_acl_user" to "authenticated";

grant delete on table "public"."folder_acl_user" to "service_role";

grant insert on table "public"."folder_acl_user" to "service_role";

grant references on table "public"."folder_acl_user" to "service_role";

grant select on table "public"."folder_acl_user" to "service_role";

grant trigger on table "public"."folder_acl_user" to "service_role";

grant truncate on table "public"."folder_acl_user" to "service_role";

grant update on table "public"."folder_acl_user" to "service_role";

grant delete on table "public"."folder_contracts" to "anon";

grant insert on table "public"."folder_contracts" to "anon";

grant references on table "public"."folder_contracts" to "anon";

grant select on table "public"."folder_contracts" to "anon";

grant trigger on table "public"."folder_contracts" to "anon";

grant truncate on table "public"."folder_contracts" to "anon";

grant update on table "public"."folder_contracts" to "anon";

grant delete on table "public"."folder_contracts" to "authenticated";

grant insert on table "public"."folder_contracts" to "authenticated";

grant references on table "public"."folder_contracts" to "authenticated";

grant select on table "public"."folder_contracts" to "authenticated";

grant trigger on table "public"."folder_contracts" to "authenticated";

grant truncate on table "public"."folder_contracts" to "authenticated";

grant update on table "public"."folder_contracts" to "authenticated";

grant delete on table "public"."folder_contracts" to "service_role";

grant insert on table "public"."folder_contracts" to "service_role";

grant references on table "public"."folder_contracts" to "service_role";

grant select on table "public"."folder_contracts" to "service_role";

grant trigger on table "public"."folder_contracts" to "service_role";

grant truncate on table "public"."folder_contracts" to "service_role";

grant update on table "public"."folder_contracts" to "service_role";

grant delete on table "public"."folders" to "anon";

grant insert on table "public"."folders" to "anon";

grant references on table "public"."folders" to "anon";

grant select on table "public"."folders" to "anon";

grant trigger on table "public"."folders" to "anon";

grant truncate on table "public"."folders" to "anon";

grant update on table "public"."folders" to "anon";

grant delete on table "public"."folders" to "authenticated";

grant insert on table "public"."folders" to "authenticated";

grant references on table "public"."folders" to "authenticated";

grant select on table "public"."folders" to "authenticated";

grant trigger on table "public"."folders" to "authenticated";

grant truncate on table "public"."folders" to "authenticated";

grant update on table "public"."folders" to "authenticated";

grant delete on table "public"."folders" to "service_role";

grant insert on table "public"."folders" to "service_role";

grant references on table "public"."folders" to "service_role";

grant select on table "public"."folders" to "service_role";

grant trigger on table "public"."folders" to "service_role";

grant truncate on table "public"."folders" to "service_role";

grant update on table "public"."folders" to "service_role";

grant delete on table "public"."group_members" to "anon";

grant insert on table "public"."group_members" to "anon";

grant references on table "public"."group_members" to "anon";

grant select on table "public"."group_members" to "anon";

grant trigger on table "public"."group_members" to "anon";

grant truncate on table "public"."group_members" to "anon";

grant update on table "public"."group_members" to "anon";

grant delete on table "public"."group_members" to "authenticated";

grant insert on table "public"."group_members" to "authenticated";

grant references on table "public"."group_members" to "authenticated";

grant select on table "public"."group_members" to "authenticated";

grant trigger on table "public"."group_members" to "authenticated";

grant truncate on table "public"."group_members" to "authenticated";

grant update on table "public"."group_members" to "authenticated";

grant delete on table "public"."group_members" to "service_role";

grant insert on table "public"."group_members" to "service_role";

grant references on table "public"."group_members" to "service_role";

grant select on table "public"."group_members" to "service_role";

grant trigger on table "public"."group_members" to "service_role";

grant truncate on table "public"."group_members" to "service_role";

grant update on table "public"."group_members" to "service_role";

grant delete on table "public"."groups" to "anon";

grant insert on table "public"."groups" to "anon";

grant references on table "public"."groups" to "anon";

grant select on table "public"."groups" to "anon";

grant trigger on table "public"."groups" to "anon";

grant truncate on table "public"."groups" to "anon";

grant update on table "public"."groups" to "anon";

grant delete on table "public"."groups" to "authenticated";

grant insert on table "public"."groups" to "authenticated";

grant references on table "public"."groups" to "authenticated";

grant select on table "public"."groups" to "authenticated";

grant trigger on table "public"."groups" to "authenticated";

grant truncate on table "public"."groups" to "authenticated";

grant update on table "public"."groups" to "authenticated";

grant delete on table "public"."groups" to "service_role";

grant insert on table "public"."groups" to "service_role";

grant references on table "public"."groups" to "service_role";

grant select on table "public"."groups" to "service_role";

grant trigger on table "public"."groups" to "service_role";

grant truncate on table "public"."groups" to "service_role";

grant update on table "public"."groups" to "service_role";

create policy "Read contract_acl_group in org"
on "public"."contract_acl_group"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Read contract_acl_user in org"
on "public"."contract_acl_user"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "contracts_read"
on "public"."contracts"
as permissive
for select
to authenticated
using (((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))) AND (is_org_admin(organization_id, auth.uid()) OR (EXISTS ( SELECT 1
   FROM contract_acl_user cu
  WHERE ((cu.organization_id = contracts.organization_id) AND (cu.contract_id = contracts.id) AND (cu.user_id = auth.uid())))) OR (EXISTS ( SELECT 1
   FROM (contract_acl_group cg
     JOIN group_members gm ON (((gm.organization_id = cg.organization_id) AND (gm.group_id = cg.group_id) AND (gm.user_id = auth.uid()))))
  WHERE ((cg.organization_id = contracts.organization_id) AND (cg.contract_id = contracts.id)))) OR (EXISTS ( WITH f_child AS (
         SELECT f.id,
            f.path
           FROM (folder_contracts fc
             JOIN folders f ON (((f.id = fc.folder_id) AND (f.organization_id = contracts.organization_id))))
          WHERE ((fc.organization_id = contracts.organization_id) AND (fc.contract_id = contracts.id))
        ), u_grants AS (
         SELECT fu.folder_id,
            f.path
           FROM (folder_acl_user fu
             JOIN folders f ON (((f.id = fu.folder_id) AND (f.organization_id = fu.organization_id))))
          WHERE ((fu.organization_id = contracts.organization_id) AND (fu.user_id = auth.uid()))
        ), g_grants AS (
         SELECT fg.folder_id,
            f.path
           FROM ((folder_acl_group fg
             JOIN group_members gm ON (((gm.organization_id = fg.organization_id) AND (gm.group_id = fg.group_id) AND (gm.user_id = auth.uid()))))
             JOIN folders f ON (((f.id = fg.folder_id) AND (f.organization_id = fg.organization_id))))
          WHERE (fg.organization_id = contracts.organization_id)
        )
 SELECT 1
   FROM f_child c
  WHERE ((EXISTS ( SELECT 1
           FROM u_grants ug
          WHERE (ug.path @> c.path))) OR (EXISTS ( SELECT 1
           FROM g_grants gg
          WHERE (gg.path @> c.path)))))))));


create policy "Read folder_acl_group in org"
on "public"."folder_acl_group"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Read folder_acl_user in org"
on "public"."folder_acl_user"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Role OVERRIDE: supervisors file contracts"
on "public"."folder_contracts"
as permissive
for insert
to authenticated
with check (is_org_admin(organization_id, auth.uid()));


create policy "Role OVERRIDE: supervisors unfile contracts"
on "public"."folder_contracts"
as permissive
for delete
to authenticated
using (is_org_admin(organization_id, auth.uid()));


create policy "Users can create folder_contracts in their organization"
on "public"."folder_contracts"
as permissive
for insert
to authenticated
with check ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Users can view folder_contracts in their organization"
on "public"."folder_contracts"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Role OVERRIDE: folder-admins create subfolders"
on "public"."folders"
as permissive
for insert
to authenticated
with check ((is_folder_admin(organization_id, auth.uid()) AND (parent_id IS NOT NULL)));


create policy "Role OVERRIDE: folder-admins delete subfolders"
on "public"."folders"
as permissive
for delete
to authenticated
using ((is_folder_admin(organization_id, auth.uid()) AND (parent_id IS NOT NULL)));


create policy "Role OVERRIDE: folder-admins update subfolders"
on "public"."folders"
as permissive
for update
to authenticated
using ((is_folder_admin(organization_id, auth.uid()) AND (parent_id IS NOT NULL)))
with check ((is_folder_admin(organization_id, auth.uid()) AND (parent_id IS NOT NULL)));


create policy "Role OVERRIDE: supervisors create folders"
on "public"."folders"
as permissive
for insert
to authenticated
with check (is_org_admin(organization_id, auth.uid()));


create policy "Role OVERRIDE: supervisors delete folders"
on "public"."folders"
as permissive
for delete
to authenticated
using (is_org_admin(organization_id, auth.uid()));


create policy "Role OVERRIDE: supervisors update folders"
on "public"."folders"
as permissive
for update
to authenticated
using (is_org_admin(organization_id, auth.uid()))
with check (is_org_admin(organization_id, auth.uid()));


create policy "Role OVERRIDE: supervisors view folders"
on "public"."folders"
as permissive
for select
to authenticated
using (is_org_admin(organization_id, auth.uid()));


create policy "Users can create folders in their organization"
on "public"."folders"
as permissive
for insert
to authenticated
with check ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Users can view folders in their organization"
on "public"."folders"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Read group_members in org"
on "public"."group_members"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


create policy "Read groups in org"
on "public"."groups"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))));


CREATE TRIGGER t_caclg_sameorg BEFORE INSERT OR UPDATE ON public.contract_acl_group FOR EACH ROW EXECUTE FUNCTION trg_same_organization();

CREATE TRIGGER t_caclu_sameorg BEFORE INSERT OR UPDATE ON public.contract_acl_user FOR EACH ROW EXECUTE FUNCTION trg_same_organization();

CREATE TRIGGER t_faclg_sameorg BEFORE INSERT OR UPDATE ON public.folder_acl_group FOR EACH ROW EXECUTE FUNCTION trg_same_organization();

CREATE TRIGGER t_faclu_sameorg BEFORE INSERT OR UPDATE ON public.folder_acl_user FOR EACH ROW EXECUTE FUNCTION trg_same_organization();

CREATE TRIGGER t_folder_contracts_sameorg BEFORE INSERT OR UPDATE ON public.folder_contracts FOR EACH ROW EXECUTE FUNCTION trg_same_organization();

CREATE TRIGGER trigger_reparent_update_subtree BEFORE UPDATE OF parent_id ON public.folders FOR EACH ROW EXECUTE FUNCTION reparent_update_subtree();

CREATE TRIGGER trigger_set_path_before_insert BEFORE INSERT ON public.folders FOR EACH ROW EXECUTE FUNCTION set_path_before_insert();


