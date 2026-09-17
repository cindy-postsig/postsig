create sequence "public"."investor_equity_plan_id_seq";

create sequence "public"."investor_equity_plan_version_id_seq";

create sequence "public"."investor_instrument_types_id_seq";

create sequence "public"."investor_seat_types_id_seq";

create sequence "public"."investor_transaction_types_id_seq";

drop trigger if exists "audit_investor_convertible_instruments_trigger" on "public"."investor_convertible_instruments";

drop trigger if exists "investor_convertible_instruments_updated_at_trigger" on "public"."investor_convertible_instruments";

drop policy "investor_convertible_instruments_anon_deny" on "public"."investor_convertible_instruments";

drop policy "investor_convertible_instruments_delete" on "public"."investor_convertible_instruments";

drop policy "investor_convertible_instruments_insert" on "public"."investor_convertible_instruments";

drop policy "investor_convertible_instruments_select" on "public"."investor_convertible_instruments";

drop policy "investor_convertible_instruments_update" on "public"."investor_convertible_instruments";

alter table "public"."document_field_values" drop constraint "document_field_values_module_document_id_module_extraction__key";

alter table "public"."investor_convertible_instruments" drop constraint "investor_convertible_instruments_conversion_event_id_fkey";

alter table "public"."investor_convertible_instruments" drop constraint "investor_convertible_instruments_source_document_id_fkey";

alter table "public"."investor_convertible_instruments" drop constraint "investor_convertible_instruments_status_check";

alter table "public"."investor_convertible_instruments" drop constraint "investor_convertible_instruments_entity_id_fkey";

alter table "public"."investor_convertible_instruments" drop constraint "investor_convertible_instruments_party_id_fkey";

drop index if exists "public"."document_field_values_module_document_id_module_extraction__key";

drop index if exists "public"."investor_convertible_instruments_conversion_event_id_idx";

drop index if exists "public"."investor_convertible_instruments_created_at_idx";

drop index if exists "public"."investor_convertible_instruments_entity_id_idx";

drop index if exists "public"."investor_convertible_instruments_entity_status_idx";

drop index if exists "public"."investor_convertible_instruments_party_id_idx";

drop index if exists "public"."investor_convertible_instruments_source_document_id_idx";

drop index if exists "public"."investor_convertible_instruments_status_idx";


  create table "public"."investor_equity_plan" (
    "id" bigint not null default nextval('public.investor_equity_plan_id_seq'::regclass),
    "entity_id" bigint not null,
    "name" text not null,
    "adoption_date" date not null,
    "expiration_date" date,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."investor_equity_plan_version" (
    "id" bigint not null default nextval('public.investor_equity_plan_version_id_seq'::regclass),
    "plan_id" bigint not null,
    "effective_date" date not null,
    "authorized_pool_shares" numeric,
    "outstanding_options" numeric,
    "available_shares" numeric,
    "source_document_id" bigint
      );



  create table "public"."investor_instrument_types" (
    "id" bigint not null default nextval('public.investor_instrument_types_id_seq'::regclass),
    "code" text not null,
    "label" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."investor_seat_types" (
    "id" bigint not null default nextval('public.investor_seat_types_id_seq'::regclass),
    "code" text not null,
    "label" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now()
      );



  create table "public"."investor_transaction_types" (
    "id" bigint not null default nextval('public.investor_transaction_types_id_seq'::regclass),
    "code" text not null,
    "description" text,
    "created_at" timestamp with time zone not null default now()
      );


alter table "public"."investor_board_representation" add column "designating_party_id" bigint;

alter table "public"."investor_board_representation" add column "designating_security_id" bigint;

alter table "public"."investor_board_representation" add column "seat_type_id" bigint;

alter table "public"."investor_closing" add column "closing_label" text;

alter table "public"."investor_closing_participant" add column "transaction_type_id" bigint not null;

alter table "public"."investor_convertible_instruments" drop column "conversion_event_id";

alter table "public"."investor_convertible_instruments" drop column "instrument_type";

alter table "public"."investor_convertible_instruments" drop column "maturity_date";

alter table "public"."investor_convertible_instruments" drop column "status";

alter table "public"."investor_convertible_instruments" add column "instrument_type_id" bigint;

alter table "public"."investor_convertible_instruments" alter column "discount_rate" set data type numeric(5,4) using "discount_rate"::numeric(5,4);

alter table "public"."investor_convertible_instruments" alter column "party_id" drop not null;

alter table "public"."investor_convertible_instruments" alter column "principal_amount" set data type numeric(20,2) using "principal_amount"::numeric(20,2);

alter table "public"."investor_convertible_instruments" alter column "valuation_cap" set data type numeric(20,2) using "valuation_cap"::numeric(20,2);

alter table "public"."investor_convertible_instruments" disable row level security;

alter table "public"."investor_security" add column "is_valuation_reference" boolean default false;

alter table "public"."investor_security_terms_version" add column "authorized_shares" numeric;

alter table "public"."investor_security_terms_version" add column "par_value" numeric;

alter table "public"."master_field_definitions" add column "settings" jsonb;

alter sequence "public"."investor_equity_plan_id_seq" owned by "public"."investor_equity_plan"."id";

alter sequence "public"."investor_equity_plan_version_id_seq" owned by "public"."investor_equity_plan_version"."id";

alter sequence "public"."investor_instrument_types_id_seq" owned by "public"."investor_instrument_types"."id";

alter sequence "public"."investor_seat_types_id_seq" owned by "public"."investor_seat_types"."id";

alter sequence "public"."investor_transaction_types_id_seq" owned by "public"."investor_transaction_types"."id";

CREATE UNIQUE INDEX document_field_values_module_document_extraction_field_def_key ON public.document_field_values USING btree (module_document_id, module_extraction_id, field_definition_id);

CREATE INDEX idx_ici_issue_date ON public.investor_convertible_instruments USING btree (issue_date);

CREATE INDEX idx_ici_party_id ON public.investor_convertible_instruments USING btree (party_id);

CREATE INDEX idx_ici_source_document_id ON public.investor_convertible_instruments USING btree (source_document_id);

CREATE INDEX idx_icp_closing_id ON public.investor_closing_participant USING btree (closing_id);

CREATE INDEX idx_icp_party_id ON public.investor_closing_participant USING btree (party_id);

CREATE INDEX idx_icp_source_document_id ON public.investor_closing_participant USING btree (source_document_id);

CREATE INDEX idx_icp_transaction_type_id ON public.investor_closing_participant USING btree (transaction_type_id);

CREATE INDEX investor_board_representation_seat_type_id_idx ON public.investor_board_representation USING btree (seat_type_id);

CREATE INDEX investor_equity_plan_entity_id_idx ON public.investor_equity_plan USING btree (entity_id);

CREATE UNIQUE INDEX investor_equity_plan_entity_name_unique ON public.investor_equity_plan USING btree (entity_id, name);

CREATE UNIQUE INDEX investor_equity_plan_pkey ON public.investor_equity_plan USING btree (id);

CREATE UNIQUE INDEX investor_equity_plan_version_pkey ON public.investor_equity_plan_version USING btree (id);

CREATE INDEX investor_equity_plan_version_plan_id_idx ON public.investor_equity_plan_version USING btree (plan_id);

CREATE INDEX investor_equity_plan_version_source_document_id_idx ON public.investor_equity_plan_version USING btree (source_document_id);

CREATE UNIQUE INDEX investor_instrument_types_code_key ON public.investor_instrument_types USING btree (code);

CREATE UNIQUE INDEX investor_instrument_types_pkey ON public.investor_instrument_types USING btree (id);

CREATE UNIQUE INDEX investor_seat_types_code_key ON public.investor_seat_types USING btree (code);

CREATE UNIQUE INDEX investor_seat_types_pkey ON public.investor_seat_types USING btree (id);

CREATE UNIQUE INDEX investor_transaction_types_code_key ON public.investor_transaction_types USING btree (code);

CREATE UNIQUE INDEX investor_transaction_types_pkey ON public.investor_transaction_types USING btree (id);

alter table "public"."investor_equity_plan" add constraint "investor_equity_plan_pkey" PRIMARY KEY using index "investor_equity_plan_pkey";

alter table "public"."investor_equity_plan_version" add constraint "investor_equity_plan_version_pkey" PRIMARY KEY using index "investor_equity_plan_version_pkey";

alter table "public"."investor_instrument_types" add constraint "investor_instrument_types_pkey" PRIMARY KEY using index "investor_instrument_types_pkey";

alter table "public"."investor_seat_types" add constraint "investor_seat_types_pkey" PRIMARY KEY using index "investor_seat_types_pkey";

alter table "public"."investor_transaction_types" add constraint "investor_transaction_types_pkey" PRIMARY KEY using index "investor_transaction_types_pkey";

alter table "public"."document_field_values" add constraint "document_field_values_module_document_extraction_field_def_key" UNIQUE using index "document_field_values_module_document_extraction_field_def_key";

alter table "public"."investor_board_representation" add constraint "investor_board_representation_designating_party_id_fkey" FOREIGN KEY (designating_party_id) REFERENCES public.investor_party(id) not valid;

alter table "public"."investor_board_representation" validate constraint "investor_board_representation_designating_party_id_fkey";

alter table "public"."investor_board_representation" add constraint "investor_board_representation_designating_security_id_fkey" FOREIGN KEY (designating_security_id) REFERENCES public.investor_security(id) not valid;

alter table "public"."investor_board_representation" validate constraint "investor_board_representation_designating_security_id_fkey";

alter table "public"."investor_board_representation" add constraint "investor_board_representation_seat_type_id_fkey" FOREIGN KEY (seat_type_id) REFERENCES public.investor_seat_types(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."investor_board_representation" validate constraint "investor_board_representation_seat_type_id_fkey";

alter table "public"."investor_closing_participant" add constraint "fk_icp_transaction_type" FOREIGN KEY (transaction_type_id) REFERENCES public.investor_transaction_types(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."investor_closing_participant" validate constraint "fk_icp_transaction_type";

alter table "public"."investor_convertible_instruments" add constraint "investor_convertible_instruments_discount_rate_check" CHECK (((discount_rate >= (0)::numeric) AND (discount_rate <= (1)::numeric))) not valid;

alter table "public"."investor_convertible_instruments" validate constraint "investor_convertible_instruments_discount_rate_check";

alter table "public"."investor_convertible_instruments" add constraint "investor_convertible_instruments_instrument_type_id_fkey" FOREIGN KEY (instrument_type_id) REFERENCES public.investor_instrument_types(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."investor_convertible_instruments" validate constraint "investor_convertible_instruments_instrument_type_id_fkey";

alter table "public"."investor_convertible_instruments" add constraint "investor_convertible_instruments_principal_amount_check" CHECK ((principal_amount >= (0)::numeric)) not valid;

alter table "public"."investor_convertible_instruments" validate constraint "investor_convertible_instruments_principal_amount_check";

alter table "public"."investor_convertible_instruments" add constraint "investor_convertible_instruments_valuation_cap_check" CHECK ((valuation_cap >= (0)::numeric)) not valid;

alter table "public"."investor_convertible_instruments" validate constraint "investor_convertible_instruments_valuation_cap_check";

alter table "public"."investor_equity_plan" add constraint "investor_equity_plan_dates" CHECK (((expiration_date IS NULL) OR (expiration_date >= adoption_date))) not valid;

alter table "public"."investor_equity_plan" validate constraint "investor_equity_plan_dates";

alter table "public"."investor_equity_plan" add constraint "investor_equity_plan_entity_id_fkey" FOREIGN KEY (entity_id) REFERENCES public.module_entities(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."investor_equity_plan" validate constraint "investor_equity_plan_entity_id_fkey";

alter table "public"."investor_equity_plan" add constraint "investor_equity_plan_entity_name_unique" UNIQUE using index "investor_equity_plan_entity_name_unique";

alter table "public"."investor_equity_plan_version" add constraint "investor_equity_plan_version_authorized_pool_shares_check" CHECK (((authorized_pool_shares IS NULL) OR (authorized_pool_shares >= (0)::numeric))) not valid;

alter table "public"."investor_equity_plan_version" validate constraint "investor_equity_plan_version_authorized_pool_shares_check";

alter table "public"."investor_equity_plan_version" add constraint "investor_equity_plan_version_available_check" CHECK (((authorized_pool_shares IS NULL) OR (outstanding_options IS NULL) OR (available_shares IS NULL) OR ((authorized_pool_shares >= outstanding_options) AND (available_shares = (authorized_pool_shares - outstanding_options))))) not valid;

alter table "public"."investor_equity_plan_version" validate constraint "investor_equity_plan_version_available_check";

alter table "public"."investor_equity_plan_version" add constraint "investor_equity_plan_version_available_shares_check" CHECK (((available_shares IS NULL) OR (available_shares >= (0)::numeric))) not valid;

alter table "public"."investor_equity_plan_version" validate constraint "investor_equity_plan_version_available_shares_check";

alter table "public"."investor_equity_plan_version" add constraint "investor_equity_plan_version_outstanding_options_check" CHECK (((outstanding_options IS NULL) OR (outstanding_options >= (0)::numeric))) not valid;

alter table "public"."investor_equity_plan_version" validate constraint "investor_equity_plan_version_outstanding_options_check";

alter table "public"."investor_equity_plan_version" add constraint "investor_equity_plan_version_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES public.investor_equity_plan(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."investor_equity_plan_version" validate constraint "investor_equity_plan_version_plan_id_fkey";

alter table "public"."investor_equity_plan_version" add constraint "investor_equity_plan_version_source_document_id_fkey" FOREIGN KEY (source_document_id) REFERENCES public.module_document_files(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."investor_equity_plan_version" validate constraint "investor_equity_plan_version_source_document_id_fkey";

alter table "public"."investor_instrument_types" add constraint "investor_instrument_types_code_key" UNIQUE using index "investor_instrument_types_code_key";

alter table "public"."investor_seat_types" add constraint "investor_seat_types_code_key" UNIQUE using index "investor_seat_types_code_key";

alter table "public"."investor_transaction_types" add constraint "investor_transaction_types_code_key" UNIQUE using index "investor_transaction_types_code_key";

alter table "public"."investor_convertible_instruments" add constraint "investor_convertible_instruments_entity_id_fkey" FOREIGN KEY (entity_id) REFERENCES public.module_entities(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."investor_convertible_instruments" validate constraint "investor_convertible_instruments_entity_id_fkey";

alter table "public"."investor_convertible_instruments" add constraint "investor_convertible_instruments_party_id_fkey" FOREIGN KEY (party_id) REFERENCES public.investor_party(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."investor_convertible_instruments" validate constraint "investor_convertible_instruments_party_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."investor_convertible_instruments" to "postgres";

grant insert on table "public"."investor_convertible_instruments" to "postgres";

grant references on table "public"."investor_convertible_instruments" to "postgres";

grant select on table "public"."investor_convertible_instruments" to "postgres";

grant trigger on table "public"."investor_convertible_instruments" to "postgres";

grant truncate on table "public"."investor_convertible_instruments" to "postgres";

grant update on table "public"."investor_convertible_instruments" to "postgres";

grant delete on table "public"."investor_equity_plan" to "anon";

grant insert on table "public"."investor_equity_plan" to "anon";

grant references on table "public"."investor_equity_plan" to "anon";

grant select on table "public"."investor_equity_plan" to "anon";

grant trigger on table "public"."investor_equity_plan" to "anon";

grant truncate on table "public"."investor_equity_plan" to "anon";

grant update on table "public"."investor_equity_plan" to "anon";

grant delete on table "public"."investor_equity_plan" to "authenticated";

grant insert on table "public"."investor_equity_plan" to "authenticated";

grant references on table "public"."investor_equity_plan" to "authenticated";

grant select on table "public"."investor_equity_plan" to "authenticated";

grant trigger on table "public"."investor_equity_plan" to "authenticated";

grant truncate on table "public"."investor_equity_plan" to "authenticated";

grant update on table "public"."investor_equity_plan" to "authenticated";

grant delete on table "public"."investor_equity_plan" to "postgres";

grant insert on table "public"."investor_equity_plan" to "postgres";

grant references on table "public"."investor_equity_plan" to "postgres";

grant select on table "public"."investor_equity_plan" to "postgres";

grant trigger on table "public"."investor_equity_plan" to "postgres";

grant truncate on table "public"."investor_equity_plan" to "postgres";

grant update on table "public"."investor_equity_plan" to "postgres";

grant delete on table "public"."investor_equity_plan" to "service_role";

grant insert on table "public"."investor_equity_plan" to "service_role";

grant references on table "public"."investor_equity_plan" to "service_role";

grant select on table "public"."investor_equity_plan" to "service_role";

grant trigger on table "public"."investor_equity_plan" to "service_role";

grant truncate on table "public"."investor_equity_plan" to "service_role";

grant update on table "public"."investor_equity_plan" to "service_role";

grant delete on table "public"."investor_equity_plan_version" to "anon";

grant insert on table "public"."investor_equity_plan_version" to "anon";

grant references on table "public"."investor_equity_plan_version" to "anon";

grant select on table "public"."investor_equity_plan_version" to "anon";

grant trigger on table "public"."investor_equity_plan_version" to "anon";

grant truncate on table "public"."investor_equity_plan_version" to "anon";

grant update on table "public"."investor_equity_plan_version" to "anon";

grant delete on table "public"."investor_equity_plan_version" to "authenticated";

grant insert on table "public"."investor_equity_plan_version" to "authenticated";

grant references on table "public"."investor_equity_plan_version" to "authenticated";

grant select on table "public"."investor_equity_plan_version" to "authenticated";

grant trigger on table "public"."investor_equity_plan_version" to "authenticated";

grant truncate on table "public"."investor_equity_plan_version" to "authenticated";

grant update on table "public"."investor_equity_plan_version" to "authenticated";

grant delete on table "public"."investor_equity_plan_version" to "postgres";

grant insert on table "public"."investor_equity_plan_version" to "postgres";

grant references on table "public"."investor_equity_plan_version" to "postgres";

grant select on table "public"."investor_equity_plan_version" to "postgres";

grant trigger on table "public"."investor_equity_plan_version" to "postgres";

grant truncate on table "public"."investor_equity_plan_version" to "postgres";

grant update on table "public"."investor_equity_plan_version" to "postgres";

grant delete on table "public"."investor_equity_plan_version" to "service_role";

grant insert on table "public"."investor_equity_plan_version" to "service_role";

grant references on table "public"."investor_equity_plan_version" to "service_role";

grant select on table "public"."investor_equity_plan_version" to "service_role";

grant trigger on table "public"."investor_equity_plan_version" to "service_role";

grant truncate on table "public"."investor_equity_plan_version" to "service_role";

grant update on table "public"."investor_equity_plan_version" to "service_role";

grant delete on table "public"."investor_instrument_types" to "anon";

grant insert on table "public"."investor_instrument_types" to "anon";

grant references on table "public"."investor_instrument_types" to "anon";

grant select on table "public"."investor_instrument_types" to "anon";

grant trigger on table "public"."investor_instrument_types" to "anon";

grant truncate on table "public"."investor_instrument_types" to "anon";

grant update on table "public"."investor_instrument_types" to "anon";

grant delete on table "public"."investor_instrument_types" to "authenticated";

grant insert on table "public"."investor_instrument_types" to "authenticated";

grant references on table "public"."investor_instrument_types" to "authenticated";

grant select on table "public"."investor_instrument_types" to "authenticated";

grant trigger on table "public"."investor_instrument_types" to "authenticated";

grant truncate on table "public"."investor_instrument_types" to "authenticated";

grant update on table "public"."investor_instrument_types" to "authenticated";

grant delete on table "public"."investor_instrument_types" to "postgres";

grant insert on table "public"."investor_instrument_types" to "postgres";

grant references on table "public"."investor_instrument_types" to "postgres";

grant select on table "public"."investor_instrument_types" to "postgres";

grant trigger on table "public"."investor_instrument_types" to "postgres";

grant truncate on table "public"."investor_instrument_types" to "postgres";

grant update on table "public"."investor_instrument_types" to "postgres";

grant delete on table "public"."investor_instrument_types" to "service_role";

grant insert on table "public"."investor_instrument_types" to "service_role";

grant references on table "public"."investor_instrument_types" to "service_role";

grant select on table "public"."investor_instrument_types" to "service_role";

grant trigger on table "public"."investor_instrument_types" to "service_role";

grant truncate on table "public"."investor_instrument_types" to "service_role";

grant update on table "public"."investor_instrument_types" to "service_role";

grant delete on table "public"."investor_seat_types" to "anon";

grant insert on table "public"."investor_seat_types" to "anon";

grant references on table "public"."investor_seat_types" to "anon";

grant select on table "public"."investor_seat_types" to "anon";

grant trigger on table "public"."investor_seat_types" to "anon";

grant truncate on table "public"."investor_seat_types" to "anon";

grant update on table "public"."investor_seat_types" to "anon";

grant delete on table "public"."investor_seat_types" to "authenticated";

grant insert on table "public"."investor_seat_types" to "authenticated";

grant references on table "public"."investor_seat_types" to "authenticated";

grant select on table "public"."investor_seat_types" to "authenticated";

grant trigger on table "public"."investor_seat_types" to "authenticated";

grant truncate on table "public"."investor_seat_types" to "authenticated";

grant update on table "public"."investor_seat_types" to "authenticated";

grant delete on table "public"."investor_seat_types" to "postgres";

grant insert on table "public"."investor_seat_types" to "postgres";

grant references on table "public"."investor_seat_types" to "postgres";

grant select on table "public"."investor_seat_types" to "postgres";

grant trigger on table "public"."investor_seat_types" to "postgres";

grant truncate on table "public"."investor_seat_types" to "postgres";

grant update on table "public"."investor_seat_types" to "postgres";

grant delete on table "public"."investor_seat_types" to "service_role";

grant insert on table "public"."investor_seat_types" to "service_role";

grant references on table "public"."investor_seat_types" to "service_role";

grant select on table "public"."investor_seat_types" to "service_role";

grant trigger on table "public"."investor_seat_types" to "service_role";

grant truncate on table "public"."investor_seat_types" to "service_role";

grant update on table "public"."investor_seat_types" to "service_role";

grant delete on table "public"."investor_transaction_types" to "anon";

grant insert on table "public"."investor_transaction_types" to "anon";

grant references on table "public"."investor_transaction_types" to "anon";

grant select on table "public"."investor_transaction_types" to "anon";

grant trigger on table "public"."investor_transaction_types" to "anon";

grant truncate on table "public"."investor_transaction_types" to "anon";

grant update on table "public"."investor_transaction_types" to "anon";

grant delete on table "public"."investor_transaction_types" to "authenticated";

grant insert on table "public"."investor_transaction_types" to "authenticated";

grant references on table "public"."investor_transaction_types" to "authenticated";

grant select on table "public"."investor_transaction_types" to "authenticated";

grant trigger on table "public"."investor_transaction_types" to "authenticated";

grant truncate on table "public"."investor_transaction_types" to "authenticated";

grant update on table "public"."investor_transaction_types" to "authenticated";

grant delete on table "public"."investor_transaction_types" to "postgres";

grant insert on table "public"."investor_transaction_types" to "postgres";

grant references on table "public"."investor_transaction_types" to "postgres";

grant select on table "public"."investor_transaction_types" to "postgres";

grant trigger on table "public"."investor_transaction_types" to "postgres";

grant truncate on table "public"."investor_transaction_types" to "postgres";

grant update on table "public"."investor_transaction_types" to "postgres";

grant delete on table "public"."investor_transaction_types" to "service_role";

grant insert on table "public"."investor_transaction_types" to "service_role";

grant references on table "public"."investor_transaction_types" to "service_role";

grant select on table "public"."investor_transaction_types" to "service_role";

grant trigger on table "public"."investor_transaction_types" to "service_role";

grant truncate on table "public"."investor_transaction_types" to "service_role";

grant update on table "public"."investor_transaction_types" to "service_role";

CREATE TRIGGER trg_icp_set_updated_at BEFORE UPDATE ON public.investor_closing_participant FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_ici_set_updated_at BEFORE UPDATE ON public.investor_convertible_instruments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


