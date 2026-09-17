set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_expired_contracts()
 RETURNS TABLE(contract_id integer, old_status contract_status, new_status contract_status, end_date date)
 LANGUAGE plpgsql
AS $function$DECLARE
  v_auto_renewal_ids integer[];
BEGIN
  -- Create a temporary table to store contracts that need updating
  CREATE TEMP TABLE contracts_to_update AS
  SELECT
    id,
    status as old_status,
    COALESCE(
      (cancel_date->0->>'date')::date,
      (term_end_date->0->>'date')::date
    ) as effective_end_date,
    renewal_type,
    will_not_renew
  FROM contracts c
  WHERE
    COALESCE(
      (cancel_date->0->>'date')::date,
      (term_end_date->0->>'date')::date
    ) <= CURRENT_DATE
    AND status = 'active'::contract_status;

  -- Store IDs of auto-renewal contracts
  SELECT array_agg(id)
  INTO v_auto_renewal_ids
  FROM contracts_to_update
  WHERE renewal_type = 'Auto' AND (will_not_renew = false OR will_not_renew IS NULL);

  -- Update non-auto renewal contracts to unconfirmed status
  WITH updated_contracts AS (
    UPDATE contracts c
    SET status = 'unconfirmed'::contract_status
    FROM contracts_to_update ctu
    WHERE c.id = ctu.id
    AND (c.renewal_type != 'Auto' OR c.renewal_type IS NULL)
    RETURNING
      c.id,
      'unconfirmed'::contract_status as new_status,
      COALESCE(
        (c.cancel_date->0->>'date')::date,
        (c.term_end_date->0->>'date')::date
      ) as effective_end_date
  )
  INSERT INTO contracts_to_update (id, old_status, effective_end_date, renewal_type)
  SELECT
    uc.id,
    ctu.old_status,
    uc.effective_end_date,
    ctu.renewal_type
  FROM updated_contracts uc
  JOIN contracts_to_update ctu ON uc.id = ctu.id;

  -- Process auto-renewal contracts if any exist
  IF v_auto_renewal_ids IS NOT NULL AND array_length(v_auto_renewal_ids, 1) > 0 THEN
    PERFORM renew_expired_contracts(v_auto_renewal_ids, 'active'::contract_status);
  END IF;

  -- Return all processed contracts
  RETURN QUERY
  WITH auto_renewed AS (
    SELECT
      c.id,
      'active'::contract_status as new_status,
      COALESCE(
        (c.cancel_date->0->>'date')::date,
        (c.term_end_date->0->>'date')::date
      ) as effective_end_date
    FROM contracts c
    WHERE c.id = ANY(COALESCE(v_auto_renewal_ids, ARRAY[]::integer[]))
  )
  SELECT
    ctu.id as contract_id,
    ctu.old_status,
    CASE
      WHEN ar.id IS NOT NULL THEN ar.new_status
      ELSE 'unconfirmed'::contract_status
    END as new_status,
    CASE
      WHEN ar.id IS NOT NULL THEN ar.effective_end_date
      ELSE ctu.effective_end_date
    END as effective_end_date
  FROM contracts_to_update ctu
  LEFT JOIN auto_renewed ar ON ctu.id = ar.id;

  -- Clean up
  DROP TABLE contracts_to_update;
END;$function$
;



