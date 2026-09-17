-- inv_history: user-edit history for the investor module.
--
-- inv_history is an append-only record of user-driven changes: which table/row changed, the
-- per-field from/to, a snapshot of the source row as it stood at write time, and the reason the
-- user gave. Rows are written only by record_inv_history() below, called from
-- create_inv_value_override() (in the same transaction as the override) and from droid's revert
-- path. Nothing ever updates or deletes a row here.

create table if not exists "public"."inv_history" (
    "id" bigint generated always as identity not null,
    "public_uuid" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "action" text not null,
    "table_name" text not null,
    "row_id" bigint not null,
    "reason" text not null default '',
    -- { "<field_key>": { "from": <json>, "to": <json> } }
    "changes" jsonb not null,
    -- to_jsonb() of the source row at write time; null when the row no longer exists.
    "snapshot" jsonb,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now()
);

alter table "public"."inv_history" enable row level security;

CREATE UNIQUE INDEX if not exists inv_history_pkey ON public.inv_history USING btree (id);

CREATE UNIQUE INDEX if not exists inv_history_public_uuid_key ON public.inv_history USING btree (public_uuid);

-- "history for this row", the lookup every per-field UI does.
CREATE INDEX if not exists inv_history_table_row_idx ON public.inv_history USING btree (table_name, row_id);

-- "recent history for this org", the audit-log feed query.
CREATE INDEX if not exists inv_history_org_created_at_idx ON public.inv_history USING btree (organization_id, created_at DESC);

CREATE INDEX if not exists inv_history_created_by_idx ON public.inv_history USING btree (created_by);

alter table "public"."inv_history" add constraint "inv_history_pkey" PRIMARY KEY using index "inv_history_pkey";

alter table "public"."inv_history" add constraint "inv_history_public_uuid_key" UNIQUE using index "inv_history_public_uuid_key";

alter table "public"."inv_history" add constraint "inv_history_action_check" CHECK (action in ('override_created', 'override_reverted')) not valid;

alter table "public"."inv_history" validate constraint "inv_history_action_check";

alter table "public"."inv_history" add constraint "inv_history_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."inv_history" validate constraint "inv_history_organization_id_fkey";

alter table "public"."inv_history" add constraint "inv_history_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) not valid;

alter table "public"."inv_history" validate constraint "inv_history_created_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.record_inv_history(
    p_organization_id uuid,
    p_action text,
    p_table_name text,
    p_row_id bigint,
    p_reason text,
    p_changes jsonb,
    p_created_by uuid
)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    -- Allowlist for the dynamic snapshot query below. p_table_name reaches format('%I')
    -- only after passing this check, so it can never be attacker-chosen. Mirrors the
    -- entity types droid's value-override API accepts.
    allowed_tables text[] := ARRAY[
        'inv_transaction',
        'inv_cap_table_snapshot',
        'inv_security',
        'inv_security_terms',
        'inv_fund',
        'inv_financing_round',
        'inv_company',
        'inv_board_seat',
        'inv_round_terms',
        'inv_information_rights'
    ];
    v_snapshot jsonb;
    v_id bigint;
BEGIN
    IF NOT (p_table_name = ANY (allowed_tables)) THEN
        RAISE EXCEPTION 'record_inv_history: unsupported table_name %', p_table_name;
    END IF;

    EXECUTE format(
        'SELECT to_jsonb(t) FROM public.%I t WHERE t.id = $1 AND t.organization_id = $2',
        p_table_name
    )
    INTO v_snapshot
    USING p_row_id, p_organization_id;

    IF v_snapshot IS NULL AND p_action = 'override_created' THEN
        RAISE EXCEPTION
            'record_inv_history: % row % not found in organization %',
            p_table_name, p_row_id, p_organization_id;
    END IF;

    INSERT INTO public.inv_history (
        organization_id, action, table_name, row_id, reason, changes, snapshot, created_by
    ) VALUES (
        p_organization_id,
        p_action,
        p_table_name,
        p_row_id,
        coalesce(p_reason, ''),
        p_changes,
        v_snapshot,
        p_created_by
    )
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$
;

grant select on table "public"."inv_history" to "authenticated";

grant select on table "public"."inv_history" to "postgres";

grant delete on table "public"."inv_history" to "postgres";

grant insert on table "public"."inv_history" to "postgres";

grant references on table "public"."inv_history" to "postgres";

grant trigger on table "public"."inv_history" to "postgres";

grant truncate on table "public"."inv_history" to "postgres";

grant update on table "public"."inv_history" to "postgres";

grant select on table "public"."inv_history" to "service_role";

grant insert on table "public"."inv_history" to "service_role";

grant references on table "public"."inv_history" to "service_role";

-- SECURITY DEFINER functions default to EXECUTE for PUBLIC. This one takes a caller-supplied
-- organization_id/created_by, so a direct call would let any role forge history for any org.
-- Only service_role (the droid backend) and the create RPC's owner may invoke it.
revoke execute on function "public"."record_inv_history"(uuid, text, text, bigint, text, jsonb, uuid) from "public";

revoke execute on function "public"."record_inv_history"(uuid, text, text, bigint, text, jsonb, uuid) from "anon";

revoke execute on function "public"."record_inv_history"(uuid, text, text, bigint, text, jsonb, uuid) from "authenticated";

grant execute on function "public"."record_inv_history"(uuid, text, text, bigint, text, jsonb, uuid) to "service_role";

create policy "inv_history_anon_deny"
on "public"."inv_history"
as permissive
for all
to anon
using (false);

create policy "inv_history_select"
on "public"."inv_history"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))));

