drop trigger if exists "trigger_reparent_update_subtree" on "public"."folders";

drop trigger if exists "trigger_set_path_after_insert" on "public"."folders";

drop policy "Users can create folders in their organization" on "public"."folders";

drop policy "Users can view folders in their organization" on "public"."folders";

revoke delete on table "public"."folder_contracts" from "anon";

revoke insert on table "public"."folder_contracts" from "anon";

revoke references on table "public"."folder_contracts" from "anon";

revoke select on table "public"."folder_contracts" from "anon";

revoke trigger on table "public"."folder_contracts" from "anon";

revoke truncate on table "public"."folder_contracts" from "anon";

revoke update on table "public"."folder_contracts" from "anon";

revoke delete on table "public"."folder_contracts" from "authenticated";

revoke insert on table "public"."folder_contracts" from "authenticated";

revoke references on table "public"."folder_contracts" from "authenticated";

revoke select on table "public"."folder_contracts" from "authenticated";

revoke trigger on table "public"."folder_contracts" from "authenticated";

revoke truncate on table "public"."folder_contracts" from "authenticated";

revoke update on table "public"."folder_contracts" from "authenticated";

revoke delete on table "public"."folder_contracts" from "service_role";

revoke insert on table "public"."folder_contracts" from "service_role";

revoke references on table "public"."folder_contracts" from "service_role";

revoke select on table "public"."folder_contracts" from "service_role";

revoke trigger on table "public"."folder_contracts" from "service_role";

revoke truncate on table "public"."folder_contracts" from "service_role";

revoke update on table "public"."folder_contracts" from "service_role";

revoke delete on table "public"."folders" from "anon";

revoke insert on table "public"."folders" from "anon";

revoke references on table "public"."folders" from "anon";

revoke select on table "public"."folders" from "anon";

revoke trigger on table "public"."folders" from "anon";

revoke truncate on table "public"."folders" from "anon";

revoke update on table "public"."folders" from "anon";

revoke delete on table "public"."folders" from "authenticated";

revoke insert on table "public"."folders" from "authenticated";

revoke references on table "public"."folders" from "authenticated";

revoke select on table "public"."folders" from "authenticated";

revoke trigger on table "public"."folders" from "authenticated";

revoke truncate on table "public"."folders" from "authenticated";

revoke update on table "public"."folders" from "authenticated";

revoke delete on table "public"."folders" from "service_role";

revoke insert on table "public"."folders" from "service_role";

revoke references on table "public"."folders" from "service_role";

revoke select on table "public"."folders" from "service_role";

revoke trigger on table "public"."folders" from "service_role";

revoke truncate on table "public"."folders" from "service_role";

revoke update on table "public"."folders" from "service_role";

alter table "public"."folder_contracts" drop constraint "folder_contracts_contract_id_fkey";

alter table "public"."folder_contracts" drop constraint "folder_contracts_folder_id_fkey";

alter table "public"."folders" drop constraint "folders_organization_id_fkey";

alter table "public"."folders" drop constraint "folders_organization_name_parent_unique";

alter table "public"."folders" drop constraint "folders_owner_id_fkey";

alter table "public"."folders" drop constraint "folders_parent_id_fkey";

drop function if exists "public"."reparent_update_subtree"();

alter table "public"."folder_contracts" drop constraint "folder_contracts_pkey";

alter table "public"."folders" drop constraint "folders_pkey";

drop index if exists "public"."folder_contracts_pkey";

drop index if exists "public"."folders_organization_name_parent_unique";

drop index if exists "public"."folders_pkey";

drop index if exists "public"."idx_folder_contracts_contract";

drop index if exists "public"."idx_folder_contracts_folder";

drop index if exists "public"."idx_folders_org";

drop index if exists "public"."idx_folders_parent";

drop index if exists "public"."idx_folders_path";

drop table "public"."folder_contracts";

drop table "public"."folders";


