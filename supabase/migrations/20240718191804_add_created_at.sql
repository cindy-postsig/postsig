alter table "public"."contract_docs" alter column "created_at" set default (now() AT TIME ZONE 'utc'::text);

alter table "public"."contract_docs" alter column "created_at" set data type timestamp with time zone using "created_at"::timestamp with time zone;

alter table "public"."contracts" add column "created_at" timestamp with time zone default (now() AT TIME ZONE 'utc'::text);


