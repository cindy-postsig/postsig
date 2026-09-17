create type "public"."ai_extraction_status" as enum ('ai_success', 'ai_failed', 'h_success', 'h_failed');

alter table "public"."contracts" drop column "ai_success_status";

alter table "public"."contracts" add column "ai_extraction_status" ai_extraction_status;


