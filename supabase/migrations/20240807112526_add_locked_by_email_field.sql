alter table "public"."contracts" drop constraint "contracts_locked_by_fkey";

alter table "public"."contracts" add column "locked_by_email" text;


