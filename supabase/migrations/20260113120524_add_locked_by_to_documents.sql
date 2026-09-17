-- Add the new columns to the documents table

alter table "public"."documents" add column "locked_by" uuid;

alter table "public"."documents" add column "locked_by_email" text;


