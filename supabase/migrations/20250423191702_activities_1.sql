alter table "public"."activities" drop column "user_name";

alter table "public"."activities" alter column "activity_data" set data type jsonb using "activity_data"::jsonb;