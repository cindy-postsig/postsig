alter table "public"."contracts" drop column "has_ai_training_restrictions";

alter table "public"."contracts" add column "ai_training_restrictions" text;


