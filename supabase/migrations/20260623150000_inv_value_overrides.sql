-- Authoritative migration for inv_value_overrides (reconciled 2026-06-17).
-- Single shared table: nextjs writes directly via RPC; droid REST API reads/writes
-- against this same table. The droid repo's apps/api/migrations copy was a stale
-- staging duplicate with entity_id as `integer` (a bug — the referenced
-- inv_transaction.id / inv_cap_table_snapshot.id are BIGINT) and was deleted in
-- favour of this file. `id` stays uuid (both PK and the external revert handle
-- in POST /value-overrides/:id/revert); no separate bigint/public_id split —
-- this is a low-volume leaf table with no inbound FKs.
create table if not exists "public"."inv_value_overrides" (
    "id" uuid not null default gen_random_uuid(),
    "organization_id" uuid not null,
    "entity_type" text not null,
    "entity_id" bigint not null,
    "field_key" text not null,
    "original_value" jsonb not null,
    "override_value" jsonb not null,
    "reason" text not null,
    "created_by" uuid not null,
    "created_at" timestamp with time zone not null default now(),
    "reverted_at" timestamp with time zone null,
    "reverted_by" uuid null
);

alter table "public"."inv_value_overrides" enable row level security;

CREATE UNIQUE INDEX if not exists inv_value_overrides_pkey ON public.inv_value_overrides USING btree (id);

CREATE UNIQUE INDEX if not exists inv_value_overrides_active_unique ON public.inv_value_overrides (organization_id, entity_type, entity_id, field_key) WHERE (reverted_at IS NULL);

CREATE INDEX if not exists inv_value_overrides_organization_id_idx ON public.inv_value_overrides USING btree (organization_id);

CREATE INDEX if not exists inv_value_overrides_entity_idx ON public.inv_value_overrides USING btree (entity_type, entity_id);

CREATE INDEX if not exists inv_value_overrides_created_at_idx ON public.inv_value_overrides USING btree (created_at DESC);

alter table "public"."inv_value_overrides" add constraint "inv_value_overrides_pkey" PRIMARY KEY using index "inv_value_overrides_pkey";

alter table "public"."inv_value_overrides" add constraint "inv_value_overrides_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."inv_value_overrides" validate constraint "inv_value_overrides_organization_id_fkey";

alter table "public"."inv_value_overrides" add constraint "inv_value_overrides_created_by_fkey" FOREIGN KEY (created_by) REFERENCES users(id) not valid;

alter table "public"."inv_value_overrides" validate constraint "inv_value_overrides_created_by_fkey";

alter table "public"."inv_value_overrides" add constraint "inv_value_overrides_reverted_by_fkey" FOREIGN KEY (reverted_by) REFERENCES users(id) not valid;

alter table "public"."inv_value_overrides" validate constraint "inv_value_overrides_reverted_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_inv_value_override(
    p_organization_id uuid,
    p_entity_type text,
    p_entity_id bigint,
    p_field_key text,
    p_original_value jsonb,
    p_override_value jsonb,
    p_reason text,
    p_created_by uuid
)
 RETURNS "public"."inv_value_overrides"
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_result public.inv_value_overrides;
BEGIN
    -- Revert any existing active override for this (org, entity_type, entity_id, field_key)
    UPDATE public.inv_value_overrides
    SET reverted_at = now(), reverted_by = p_created_by
    WHERE organization_id = p_organization_id
      AND entity_type = p_entity_type
      AND entity_id = p_entity_id
      AND field_key = p_field_key
      AND reverted_at IS NULL;

    -- Insert the new active override
    INSERT INTO public.inv_value_overrides (
        organization_id, entity_type, entity_id, field_key,
        original_value, override_value, reason, created_by
    ) VALUES (
        p_organization_id, p_entity_type, p_entity_id, p_field_key,
        p_original_value, p_override_value, p_reason, p_created_by
    )
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$function$
;

grant delete on table "public"."inv_value_overrides" to "authenticated";

grant insert on table "public"."inv_value_overrides" to "authenticated";

grant references on table "public"."inv_value_overrides" to "authenticated";

grant select on table "public"."inv_value_overrides" to "authenticated";

grant trigger on table "public"."inv_value_overrides" to "authenticated";

grant update on table "public"."inv_value_overrides" to "authenticated";

grant delete on table "public"."inv_value_overrides" to "postgres";

grant insert on table "public"."inv_value_overrides" to "postgres";

grant references on table "public"."inv_value_overrides" to "postgres";

grant select on table "public"."inv_value_overrides" to "postgres";

grant trigger on table "public"."inv_value_overrides" to "postgres";

grant truncate on table "public"."inv_value_overrides" to "postgres";

grant update on table "public"."inv_value_overrides" to "postgres";

grant delete on table "public"."inv_value_overrides" to "service_role";

grant insert on table "public"."inv_value_overrides" to "service_role";

grant references on table "public"."inv_value_overrides" to "service_role";

grant select on table "public"."inv_value_overrides" to "service_role";

grant trigger on table "public"."inv_value_overrides" to "service_role";

grant truncate on table "public"."inv_value_overrides" to "service_role";

grant update on table "public"."inv_value_overrides" to "service_role";

grant execute on function "public"."create_inv_value_override"(uuid, text, bigint, text, jsonb, jsonb, text, uuid) to "service_role";

-- SECURITY DEFINER functions default to EXECUTE for PUBLIC. This function takes
-- caller-supplied organization_id/created_by, so a direct call would let any
-- role forge overrides for any org. Revoke the implicit grants; only
-- service_role (the droid backend) may invoke it.
revoke execute on function "public"."create_inv_value_override"(uuid, text, bigint, text, jsonb, jsonb, text, uuid) from "public";

revoke execute on function "public"."create_inv_value_override"(uuid, text, bigint, text, jsonb, jsonb, text, uuid) from "anon";

revoke execute on function "public"."create_inv_value_override"(uuid, text, bigint, text, jsonb, jsonb, text, uuid) from "authenticated";

create policy "inv_value_overrides_anon_deny"
on "public"."inv_value_overrides"
as permissive
for all
to anon
using (false);

create policy "inv_value_overrides_select"
on "public"."inv_value_overrides"
as permissive
for select
to authenticated
using ((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))));

create policy "inv_value_overrides_insert"
on "public"."inv_value_overrides"
as permissive
for insert
to authenticated
with check (((created_by = auth.uid()) AND (organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));

create policy "inv_value_overrides_update"
on "public"."inv_value_overrides"
as permissive
for update
to authenticated
using (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))))
with check (((organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid()))) AND (EXISTS ( SELECT 1
   FROM user_roles2 ur
  WHERE ((ur.user_id = auth.uid()) AND (ur.role_id = ANY (ARRAY[11, 12])))))));
