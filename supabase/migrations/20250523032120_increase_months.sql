alter table "public"."contracts" drop column "current_cancel_by_date";

alter table "public"."contracts" drop column "current_term_end_date";

alter table "public"."contracts" drop column "current_term_start_date";

alter table "public"."contracts" drop column "legacy_subscription_term";

alter table "public"."contracts" drop column "name";

alter table "public"."contracts" add column "annual_increase_months" integer;
