alter table "public"."users" alter column "advance_notice_period" set default 90;

alter table "public"."users" alter column "email_frequency" set default 'Weekly'::text;
