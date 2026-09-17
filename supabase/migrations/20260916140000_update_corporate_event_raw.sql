-- Atomic corporate event update.
--
-- An update can change the event's scalar columns and replace its whole party
-- list. Done as separate statements from the API, a failure between the delete
-- and the insert would leave the event with no parties, which the input
-- schema never allows. This function performs the scalar patch and the party
-- replacement in one transaction, locking the event row first, so either
-- everything lands or nothing does.
--
--   p_patch    jsonb object of inv_corporate_event columns to set; a key that is
--              present is applied (a JSON null clears a nullable column, and a
--              metadata that is not an object becomes '{}'), a key that is
--              absent leaves the column alone. '{}' patches nothing.
--   p_parties  jsonb array of {company_id, role, cost_allocation_ratio}; NULL
--              keeps the current parties, an empty array is rejected.
--
-- Returns false when the event does not exist in the organization, true
-- otherwise. Row checks, the unique party key and the composite foreign keys
-- still apply inside the function.

CREATE OR REPLACE FUNCTION public.update_corporate_event_raw(
    p_org_id   uuid,
    p_event_id bigint,
    p_patch    jsonb DEFAULT '{}'::jsonb,
    p_parties  jsonb DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    PERFORM 1
      FROM inv_corporate_event
     WHERE id = p_event_id
       AND organization_id = p_org_id
       FOR UPDATE;
    IF NOT FOUND THEN
        RETURN false;
    END IF;

    IF p_parties IS NOT NULL
       AND (jsonb_typeof(p_parties) <> 'array' OR jsonb_array_length(p_parties) = 0) THEN
        RAISE EXCEPTION 'corporate event % needs at least one party', p_event_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF p_patch IS NOT NULL AND p_patch <> '{}'::jsonb THEN
        UPDATE inv_corporate_event
           SET event_type             = CASE WHEN p_patch ? 'event_type'
                                             THEN p_patch->>'event_type' ELSE event_type END,
               event_date             = CASE WHEN p_patch ? 'event_date'
                                             THEN (p_patch->>'event_date')::date ELSE event_date END,
               announced_date         = CASE WHEN p_patch ? 'announced_date'
                                             THEN (p_patch->>'announced_date')::date ELSE announced_date END,
               successor_cost_booked  = CASE WHEN p_patch ? 'successor_cost_booked'
                                             THEN (p_patch->>'successor_cost_booked')::boolean ELSE successor_cost_booked END,
               cash_consideration     = CASE WHEN p_patch ? 'cash_consideration'
                                             THEN (p_patch->>'cash_consideration')::numeric ELSE cash_consideration END,
               stock_consideration    = CASE WHEN p_patch ? 'stock_consideration'
                                             THEN (p_patch->>'stock_consideration')::numeric ELSE stock_consideration END,
               deferred_consideration = CASE WHEN p_patch ? 'deferred_consideration'
                                             THEN (p_patch->>'deferred_consideration')::numeric ELSE deferred_consideration END,
               exchange_ratio         = CASE WHEN p_patch ? 'exchange_ratio'
                                             THEN (p_patch->>'exchange_ratio')::numeric ELSE exchange_ratio END,
               notes                  = CASE WHEN p_patch ? 'notes'
                                             THEN p_patch->>'notes' ELSE notes END,
               metadata               = CASE WHEN NOT (p_patch ? 'metadata') THEN metadata
                                             WHEN jsonb_typeof(p_patch->'metadata') = 'object' THEN p_patch->'metadata'
                                             ELSE '{}'::jsonb END
         WHERE id = p_event_id
           AND organization_id = p_org_id;
    END IF;

    IF p_parties IS NOT NULL THEN
        DELETE FROM inv_corporate_event_party
         WHERE event_id = p_event_id
           AND organization_id = p_org_id;

        INSERT INTO inv_corporate_event_party
            (organization_id, event_id, company_id, role, cost_allocation_ratio)
        SELECT p_org_id,
               p_event_id,
               (party->>'company_id')::bigint,
               party->>'role',
               (party->>'cost_allocation_ratio')::numeric
          FROM jsonb_array_elements(p_parties) AS party;
    END IF;

    RETURN true;
END;
$$;
