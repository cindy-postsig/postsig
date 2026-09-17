drop policy "Enable select for users based on user_id" on "public"."contract_addendums";

drop policy "Enable update for extractors based on email" on "public"."contract_addendums";

drop policy "Enable users to update their own contracts" on "public"."contract_addendums";

drop policy "Give full access to extractors" on "public"."contract_addendums";

drop policy "Users can insert into contracts" on "public"."contract_addendums";

drop policy "Users can view their own contracts" on "public"."contract_addendums";

drop policy "Enable select for users based on user_id" on "public"."contract_orphans";

drop policy "Enable update for extractors based on email" on "public"."contract_orphans";

drop policy "Enable users to update their own contracts" on "public"."contract_orphans";

drop policy "Give full access to extractors" on "public"."contract_orphans";

drop policy "Users can insert into contracts" on "public"."contract_orphans";

drop policy "Users can view their own contracts" on "public"."contract_orphans";

revoke delete on table "public"."contract_addendums" from "anon";

revoke insert on table "public"."contract_addendums" from "anon";

revoke references on table "public"."contract_addendums" from "anon";

revoke select on table "public"."contract_addendums" from "anon";

revoke trigger on table "public"."contract_addendums" from "anon";

revoke truncate on table "public"."contract_addendums" from "anon";

revoke update on table "public"."contract_addendums" from "anon";

revoke delete on table "public"."contract_addendums" from "authenticated";

revoke insert on table "public"."contract_addendums" from "authenticated";

revoke references on table "public"."contract_addendums" from "authenticated";

revoke select on table "public"."contract_addendums" from "authenticated";

revoke trigger on table "public"."contract_addendums" from "authenticated";

revoke truncate on table "public"."contract_addendums" from "authenticated";

revoke update on table "public"."contract_addendums" from "authenticated";

revoke delete on table "public"."contract_addendums" from "service_role";

revoke insert on table "public"."contract_addendums" from "service_role";

revoke references on table "public"."contract_addendums" from "service_role";

revoke select on table "public"."contract_addendums" from "service_role";

revoke trigger on table "public"."contract_addendums" from "service_role";

revoke truncate on table "public"."contract_addendums" from "service_role";

revoke update on table "public"."contract_addendums" from "service_role";

revoke delete on table "public"."contract_orphans" from "anon";

revoke insert on table "public"."contract_orphans" from "anon";

revoke references on table "public"."contract_orphans" from "anon";

revoke select on table "public"."contract_orphans" from "anon";

revoke trigger on table "public"."contract_orphans" from "anon";

revoke truncate on table "public"."contract_orphans" from "anon";

revoke update on table "public"."contract_orphans" from "anon";

revoke delete on table "public"."contract_orphans" from "authenticated";

revoke insert on table "public"."contract_orphans" from "authenticated";

revoke references on table "public"."contract_orphans" from "authenticated";

revoke select on table "public"."contract_orphans" from "authenticated";

revoke trigger on table "public"."contract_orphans" from "authenticated";

revoke truncate on table "public"."contract_orphans" from "authenticated";

revoke update on table "public"."contract_orphans" from "authenticated";

revoke delete on table "public"."contract_orphans" from "service_role";

revoke insert on table "public"."contract_orphans" from "service_role";

revoke references on table "public"."contract_orphans" from "service_role";

revoke select on table "public"."contract_orphans" from "service_role";

revoke trigger on table "public"."contract_orphans" from "service_role";

revoke truncate on table "public"."contract_orphans" from "service_role";

revoke update on table "public"."contract_orphans" from "service_role";

revoke delete on table "public"."contract_status" from "anon";

revoke insert on table "public"."contract_status" from "anon";

revoke references on table "public"."contract_status" from "anon";

revoke select on table "public"."contract_status" from "anon";

revoke trigger on table "public"."contract_status" from "anon";

revoke truncate on table "public"."contract_status" from "anon";

revoke update on table "public"."contract_status" from "anon";

revoke delete on table "public"."contract_status" from "authenticated";

revoke insert on table "public"."contract_status" from "authenticated";

revoke references on table "public"."contract_status" from "authenticated";

revoke select on table "public"."contract_status" from "authenticated";

revoke trigger on table "public"."contract_status" from "authenticated";

revoke truncate on table "public"."contract_status" from "authenticated";

revoke update on table "public"."contract_status" from "authenticated";

revoke delete on table "public"."contract_status" from "service_role";

revoke insert on table "public"."contract_status" from "service_role";

revoke references on table "public"."contract_status" from "service_role";

revoke select on table "public"."contract_status" from "service_role";

revoke trigger on table "public"."contract_status" from "service_role";

revoke truncate on table "public"."contract_status" from "service_role";

revoke update on table "public"."contract_status" from "service_role";

alter table "public"."contract_addendums" drop constraint "contract_addendums_contract_id_fkey";

alter table "public"."contract_addendums" drop constraint "contract_addendums_pkey";

alter table "public"."contract_orphans" drop constraint "contract_orphans_pkey";

drop index if exists "public"."contract_addendums_pkey";

drop index if exists "public"."contract_orphans_pkey";

drop table "public"."contract_addendums";

drop table "public"."contract_orphans";

drop table "public"."contract_status";


