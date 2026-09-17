alter table "public"."contracts" add column "ai_validation" jsonb;

alter table "public"."contracts" add column "locked_by" uuid;
