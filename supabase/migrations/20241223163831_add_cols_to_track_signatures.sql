alter table "public"."contracts" add column "all_parties_signed" boolean;

alter table "public"."contracts" add column "date_of_last_signature" date;

alter table "public"."contracts" add column "required_signature_count" integer;


