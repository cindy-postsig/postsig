drop policy "contract_comments_prefs_anon_deny" on "public"."contract_comments_prefs";

drop policy "contract_comments_prefs_insert_own" on "public"."contract_comments_prefs";

drop policy "contract_comments_prefs_select" on "public"."contract_comments_prefs";

drop policy "contract_comments_prefs_update_own" on "public"."contract_comments_prefs";

revoke delete on table "public"."contract_comments_prefs" from "anon";

revoke insert on table "public"."contract_comments_prefs" from "anon";

revoke references on table "public"."contract_comments_prefs" from "anon";

revoke select on table "public"."contract_comments_prefs" from "anon";

revoke trigger on table "public"."contract_comments_prefs" from "anon";

revoke truncate on table "public"."contract_comments_prefs" from "anon";

revoke update on table "public"."contract_comments_prefs" from "anon";

revoke delete on table "public"."contract_comments_prefs" from "authenticated";

revoke insert on table "public"."contract_comments_prefs" from "authenticated";

revoke references on table "public"."contract_comments_prefs" from "authenticated";

revoke select on table "public"."contract_comments_prefs" from "authenticated";

revoke trigger on table "public"."contract_comments_prefs" from "authenticated";

revoke truncate on table "public"."contract_comments_prefs" from "authenticated";

revoke update on table "public"."contract_comments_prefs" from "authenticated";

revoke delete on table "public"."contract_comments_prefs" from "service_role";

revoke insert on table "public"."contract_comments_prefs" from "service_role";

revoke references on table "public"."contract_comments_prefs" from "service_role";

revoke select on table "public"."contract_comments_prefs" from "service_role";

revoke trigger on table "public"."contract_comments_prefs" from "service_role";

revoke truncate on table "public"."contract_comments_prefs" from "service_role";

revoke update on table "public"."contract_comments_prefs" from "service_role";

alter table "public"."contract_comments_prefs" drop constraint "contract_comments_prefs_contract_id_fkey";

alter table "public"."contract_comments_prefs" drop constraint "contract_comments_prefs_user_id_fkey";

alter table "public"."contract_comments_prefs" drop constraint "contract_comments_prefs_pkey";

drop index if exists "public"."contract_comments_prefs_pkey";

drop index if exists "public"."idx_contract_comments_prefs_user";

drop table "public"."contract_comments_prefs";

alter table "public"."contract_comments_views" add column "comment_order" comment_order not null default 'newest_first'::comment_order;


