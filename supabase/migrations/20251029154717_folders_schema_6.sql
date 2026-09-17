drop policy "Users can create folder_contracts in their organization" on "public"."folder_contracts";

revoke delete on table "public"."contract_acl_group" from "anon";

revoke insert on table "public"."contract_acl_group" from "anon";

revoke references on table "public"."contract_acl_group" from "anon";

revoke select on table "public"."contract_acl_group" from "anon";

revoke trigger on table "public"."contract_acl_group" from "anon";

revoke truncate on table "public"."contract_acl_group" from "anon";

revoke update on table "public"."contract_acl_group" from "anon";

revoke delete on table "public"."contract_acl_user" from "anon";

revoke insert on table "public"."contract_acl_user" from "anon";

revoke references on table "public"."contract_acl_user" from "anon";

revoke select on table "public"."contract_acl_user" from "anon";

revoke trigger on table "public"."contract_acl_user" from "anon";

revoke truncate on table "public"."contract_acl_user" from "anon";

revoke update on table "public"."contract_acl_user" from "anon";

revoke delete on table "public"."folder_acl_group" from "anon";

revoke insert on table "public"."folder_acl_group" from "anon";

revoke references on table "public"."folder_acl_group" from "anon";

revoke select on table "public"."folder_acl_group" from "anon";

revoke trigger on table "public"."folder_acl_group" from "anon";

revoke truncate on table "public"."folder_acl_group" from "anon";

revoke update on table "public"."folder_acl_group" from "anon";

revoke delete on table "public"."folder_acl_user" from "anon";

revoke insert on table "public"."folder_acl_user" from "anon";

revoke references on table "public"."folder_acl_user" from "anon";

revoke select on table "public"."folder_acl_user" from "anon";

revoke trigger on table "public"."folder_acl_user" from "anon";

revoke truncate on table "public"."folder_acl_user" from "anon";

revoke update on table "public"."folder_acl_user" from "anon";

revoke delete on table "public"."folder_contracts" from "anon";

revoke insert on table "public"."folder_contracts" from "anon";

revoke references on table "public"."folder_contracts" from "anon";

revoke select on table "public"."folder_contracts" from "anon";

revoke trigger on table "public"."folder_contracts" from "anon";

revoke truncate on table "public"."folder_contracts" from "anon";

revoke update on table "public"."folder_contracts" from "anon";

revoke delete on table "public"."folders" from "anon";

revoke insert on table "public"."folders" from "anon";

revoke references on table "public"."folders" from "anon";

revoke select on table "public"."folders" from "anon";

revoke trigger on table "public"."folders" from "anon";

revoke truncate on table "public"."folders" from "anon";

revoke update on table "public"."folders" from "anon";

revoke delete on table "public"."group_members" from "anon";

revoke insert on table "public"."group_members" from "anon";

revoke references on table "public"."group_members" from "anon";

revoke select on table "public"."group_members" from "anon";

revoke trigger on table "public"."group_members" from "anon";

revoke truncate on table "public"."group_members" from "anon";

revoke update on table "public"."group_members" from "anon";

revoke delete on table "public"."groups" from "anon";

revoke insert on table "public"."groups" from "anon";

revoke references on table "public"."groups" from "anon";

revoke select on table "public"."groups" from "anon";

revoke trigger on table "public"."groups" from "anon";

revoke truncate on table "public"."groups" from "anon";

revoke update on table "public"."groups" from "anon";

create policy "Users can file contracts with write access"
on "public"."folder_contracts"
as permissive
for insert
to authenticated
with check (((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM folders_visible_to(folder_contracts.organization_id, auth.uid()) fv(id, perm)
  WHERE ((fv.id = folder_contracts.folder_id) AND (fv.perm = ANY (ARRAY['write'::permission_level, 'admin'::permission_level]))))) AND (EXISTS ( SELECT 1
   FROM contracts_visible_to(folder_contracts.organization_id, auth.uid()) cv(id, perm)
  WHERE ((cv.id = folder_contracts.contract_id) AND (cv.perm = ANY (ARRAY['write'::permission_level, 'admin'::permission_level])))))));


create policy "Users can unfile contracts with write access"
on "public"."folder_contracts"
as permissive
for delete
to authenticated
using (((organization_id IN ( SELECT users.organization_id
   FROM users
  WHERE (users.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM folders_visible_to(folder_contracts.organization_id, auth.uid()) fv(id, perm)
  WHERE ((fv.id = folder_contracts.folder_id) AND (fv.perm = ANY (ARRAY['write'::permission_level, 'admin'::permission_level]))))) AND (EXISTS ( SELECT 1
   FROM contracts_visible_to(folder_contracts.organization_id, auth.uid()) cv(id, perm)
  WHERE ((cv.id = folder_contracts.contract_id) AND (cv.perm = ANY (ARRAY['write'::permission_level, 'admin'::permission_level])))))));



