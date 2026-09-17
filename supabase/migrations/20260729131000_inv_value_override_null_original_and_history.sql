-- Two changes to create_inv_value_override, both additive.
--
-- 1. Accept a null original value, so a field that is currently empty can be edited.
--
-- 2. Record the change in inv_history, in the same transaction as the override, so the ledger
--    and the history can never disagree.

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
    v_original jsonb := coalesce(p_original_value, 'null'::jsonb);
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
        v_original, p_override_value, p_reason, p_created_by
    )
    RETURNING * INTO v_result;

    -- Same transaction as the override above. record_inv_history rejects a table_name outside
    -- its allowlist, which must stay in sync with droid's value-override ENTITY_TYPES —
    -- adding an entity type there without adding it to the allowlist fails the create loudly
    -- rather than losing the history entry silently.
    PERFORM public.record_inv_history(
        p_organization_id,
        'override_created',
        p_entity_type,
        p_entity_id,
        p_reason,
        jsonb_build_object(
            p_field_key,
            jsonb_build_object('from', v_original, 'to', p_override_value)
        ),
        p_created_by
    );

    RETURN v_result;
END;
$function$
;
