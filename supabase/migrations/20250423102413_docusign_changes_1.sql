alter table "public"."contract_docs" add column "docusign_envelope_id" text;

alter table "public"."contract_docs" add column "docusign_sent_at" timestamp with time zone;

alter table "public"."contract_docs" add column "docusign_status" text;

alter table "public"."users" add column "docusign_access_token" text;

alter table "public"."users" add column "docusign_account_id" text;

alter table "public"."users" add column "docusign_connected" boolean default false;

alter table "public"."users" add column "docusign_refresh_token" text;

