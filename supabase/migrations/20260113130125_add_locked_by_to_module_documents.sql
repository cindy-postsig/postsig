-- Add the new columns to the module_documents table

alter table "public"."documents" drop column "locked_by";

alter table "public"."documents" drop column "locked_by_email";

alter table "public"."module_documents" add column "locked_by" uuid;

alter table "public"."module_documents" add column "locked_by_email" text;


