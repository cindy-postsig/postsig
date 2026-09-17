revoke delete on table "public"."companies" from "anon";

revoke insert on table "public"."companies" from "anon";

revoke references on table "public"."companies" from "anon";

revoke select on table "public"."companies" from "anon";

revoke trigger on table "public"."companies" from "anon";

revoke truncate on table "public"."companies" from "anon";

revoke update on table "public"."companies" from "anon";

revoke delete on table "public"."document_field_values" from "anon";

revoke insert on table "public"."document_field_values" from "anon";

revoke references on table "public"."document_field_values" from "anon";

revoke select on table "public"."document_field_values" from "anon";

revoke trigger on table "public"."document_field_values" from "anon";

revoke truncate on table "public"."document_field_values" from "anon";

revoke update on table "public"."document_field_values" from "anon";

revoke delete on table "public"."document_types" from "anon";

revoke insert on table "public"."document_types" from "anon";

revoke references on table "public"."document_types" from "anon";

revoke select on table "public"."document_types" from "anon";

revoke trigger on table "public"."document_types" from "anon";

revoke truncate on table "public"."document_types" from "anon";

revoke update on table "public"."document_types" from "anon";

revoke delete on table "public"."investor_funds" from "anon";

revoke insert on table "public"."investor_funds" from "anon";

revoke references on table "public"."investor_funds" from "anon";

revoke select on table "public"."investor_funds" from "anon";

revoke trigger on table "public"."investor_funds" from "anon";

revoke truncate on table "public"."investor_funds" from "anon";

revoke update on table "public"."investor_funds" from "anon";

revoke delete on table "public"."module_document_extractions" from "anon";

revoke insert on table "public"."module_document_extractions" from "anon";

revoke references on table "public"."module_document_extractions" from "anon";

revoke select on table "public"."module_document_extractions" from "anon";

revoke trigger on table "public"."module_document_extractions" from "anon";

revoke truncate on table "public"."module_document_extractions" from "anon";

revoke update on table "public"."module_document_extractions" from "anon";

revoke delete on table "public"."module_document_files" from "anon";

revoke insert on table "public"."module_document_files" from "anon";

revoke references on table "public"."module_document_files" from "anon";

revoke select on table "public"."module_document_files" from "anon";

revoke trigger on table "public"."module_document_files" from "anon";

revoke truncate on table "public"."module_document_files" from "anon";

revoke update on table "public"."module_document_files" from "anon";

revoke delete on table "public"."module_documents" from "anon";

revoke insert on table "public"."module_documents" from "anon";

revoke references on table "public"."module_documents" from "anon";

revoke select on table "public"."module_documents" from "anon";

revoke trigger on table "public"."module_documents" from "anon";

revoke truncate on table "public"."module_documents" from "anon";

revoke update on table "public"."module_documents" from "anon";

revoke delete on table "public"."portfolio_company_funds" from "anon";

revoke insert on table "public"."portfolio_company_funds" from "anon";

revoke references on table "public"."portfolio_company_funds" from "anon";

revoke select on table "public"."portfolio_company_funds" from "anon";

revoke trigger on table "public"."portfolio_company_funds" from "anon";

revoke truncate on table "public"."portfolio_company_funds" from "anon";

revoke update on table "public"."portfolio_company_funds" from "anon";

revoke delete on table "public"."user_module_access" from "anon";

revoke insert on table "public"."user_module_access" from "anon";

revoke references on table "public"."user_module_access" from "anon";

revoke select on table "public"."user_module_access" from "anon";

revoke trigger on table "public"."user_module_access" from "anon";

revoke truncate on table "public"."user_module_access" from "anon";

revoke update on table "public"."user_module_access" from "anon";

alter table "public"."document_field_values" enable row level security;

alter table "public"."document_types" enable row level security;

alter table "public"."module_document_extractions" enable row level security;

alter table "public"."module_document_files" enable row level security;

alter table "public"."module_documents" enable row level security;

alter table "public"."organization_modules" enable row level security;

alter table "public"."user_module_access" enable row level security;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_investor_funds_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_funds" to "postgres";

grant insert on table "public"."investor_funds" to "postgres";

grant references on table "public"."investor_funds" to "postgres";

grant select on table "public"."investor_funds" to "postgres";

grant trigger on table "public"."investor_funds" to "postgres";

grant truncate on table "public"."investor_funds" to "postgres";

grant update on table "public"."investor_funds" to "postgres";

grant delete on table "public"."portfolio_company_funds" to "postgres";

grant insert on table "public"."portfolio_company_funds" to "postgres";

grant references on table "public"."portfolio_company_funds" to "postgres";

grant select on table "public"."portfolio_company_funds" to "postgres";

grant trigger on table "public"."portfolio_company_funds" to "postgres";

grant truncate on table "public"."portfolio_company_funds" to "postgres";

grant update on table "public"."portfolio_company_funds" to "postgres";

