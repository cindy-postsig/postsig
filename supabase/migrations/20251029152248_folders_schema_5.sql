alter table "public"."contract_acl_group" drop constraint "contract_acl_group_group_id_fkey";

alter table "public"."contract_acl_user" drop constraint "contract_acl_user_user_id_fkey";

alter table "public"."folder_acl_group" drop constraint "folder_acl_group_group_id_fkey";

alter table "public"."folder_acl_user" drop constraint "folder_acl_user_user_id_fkey";

CREATE UNIQUE INDEX groups_org_id_unique ON public.groups USING btree (organization_id, id);

CREATE UNIQUE INDEX users_org_id_unique ON public.users USING btree (organization_id, id);

alter table "public"."contract_acl_group" add constraint "contract_acl_group_org_group_fkey" FOREIGN KEY (organization_id, group_id) REFERENCES groups(organization_id, id) ON DELETE CASCADE not valid;

alter table "public"."contract_acl_group" validate constraint "contract_acl_group_org_group_fkey";

alter table "public"."contract_acl_user" add constraint "contract_acl_user_org_user_fkey" FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id) ON DELETE CASCADE not valid;

alter table "public"."contract_acl_user" validate constraint "contract_acl_user_org_user_fkey";

alter table "public"."folder_acl_group" add constraint "folder_acl_group_org_group_fkey" FOREIGN KEY (organization_id, group_id) REFERENCES groups(organization_id, id) ON DELETE CASCADE not valid;

alter table "public"."folder_acl_group" validate constraint "folder_acl_group_org_group_fkey";

alter table "public"."folder_acl_user" add constraint "folder_acl_user_org_user_fkey" FOREIGN KEY (organization_id, user_id) REFERENCES users(organization_id, id) ON DELETE CASCADE not valid;

alter table "public"."folder_acl_user" validate constraint "folder_acl_user_org_user_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.assert_same_org_uuid(_org uuid, _tbl text, _id_bigint bigint DEFAULT NULL::bigint, _id_uuid uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare row_org uuid;
begin
  if _tbl = 'folders' then 
    select organization_id into row_org from public.folders where id = _id_bigint;
  elsif _tbl = 'contracts' then 
    select organization_id into row_org from public.contracts where id = _id_bigint;
  elsif _tbl = 'users' then
    select organization_id into row_org from public.users where id = _id_uuid;
  elsif _tbl = 'groups' then
    select organization_id into row_org from public.groups where id = _id_bigint;
  else 
    raise exception 'unknown table %', _tbl;
  end if;
  
  if row_org is null or row_org <> _org then
    raise exception 'organization mismatch for % (expected: %, got: %)', 
      _tbl, _org, row_org;
  end if;
end$function$
;

CREATE OR REPLACE FUNCTION public.trg_same_organization()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if tg_table_name = 'folder_contracts' then
    perform public.assert_same_org_uuid(new.organization_id, 'folders', _id_bigint => new.folder_id);
    perform public.assert_same_org_uuid(new.organization_id, 'contracts', _id_bigint => new.contract_id);
    
  elsif tg_table_name = 'folder_acl_user' then
    perform public.assert_same_org_uuid(new.organization_id, 'folders', _id_bigint => new.folder_id);
    perform public.assert_same_org_uuid(new.organization_id, 'users', _id_uuid => new.user_id);
    
  elsif tg_table_name = 'folder_acl_group' then
    perform public.assert_same_org_uuid(new.organization_id, 'folders', _id_bigint => new.folder_id);
    perform public.assert_same_org_uuid(new.organization_id, 'groups', _id_bigint => new.group_id);
    
  elsif tg_table_name = 'contract_acl_user' then
    perform public.assert_same_org_uuid(new.organization_id, 'contracts', _id_bigint => new.contract_id);
    perform public.assert_same_org_uuid(new.organization_id, 'users', _id_uuid => new.user_id);
    
  elsif tg_table_name = 'contract_acl_group' then
    perform public.assert_same_org_uuid(new.organization_id, 'contracts', _id_bigint => new.contract_id);
    perform public.assert_same_org_uuid(new.organization_id, 'groups', _id_bigint => new.group_id);
  end if;
  
  return new;
end$function$
;


