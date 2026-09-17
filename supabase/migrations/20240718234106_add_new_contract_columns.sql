alter table "public"."contracts" add column "renewal_type" text;

alter table "public"."contracts" add column "renewed" boolean default true;


