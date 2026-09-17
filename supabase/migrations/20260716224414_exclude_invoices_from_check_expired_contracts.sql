set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_expired_contracts()
 RETURNS TABLE(contract_id integer, old_status contract_status, new_status contract_status, end_date date)
 LANGUAGE plpgsql
AS $function$DECLARE
  v_auto_renewal_ids integer[];
  v_batch_size integer := 100;
  i integer;
BEGIN
  -- Clean up temp tables from any prior failed execution in this session
  -- (pg_temp-qualified so an unqualified name can never resolve to a permanent table)
  DROP TABLE IF EXISTS pg_temp.contracts_to_update;
  DROP TABLE IF EXISTS pg_temp.renewed_contracts;

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
    AND status = 'active'::contract_status
    -- Invoices (contract_types id 6) are one-time documents; they never renew
    -- and must not be flipped to unconfirmed on expiry
    AND (type_id IS NULL OR type_id != 6);

  -- Store IDs of auto-renewal contracts
  SELECT array_agg(id)
  INTO v_auto_renewal_ids
  FROM contracts_to_update
  WHERE renewal_type = 'Auto' AND (will_not_renew = false OR will_not_renew IS NULL);

  -- Archive auto-renewal contracts marked will_not_renew
  UPDATE contracts c
  SET status = 'inactive'::contract_status
  FROM contracts_to_update ctu
  WHERE c.id = ctu.id
  AND ctu.renewal_type = 'Auto'
  AND ctu.will_not_renew = true;

  -- Update non-auto-renewal contracts to unconfirmed
  UPDATE contracts c
  SET status = 'unconfirmed'::contract_status
  FROM contracts_to_update ctu
  WHERE c.id = ctu.id
  AND (ctu.renewal_type IS NULL OR ctu.renewal_type != 'Auto');

  -- Track successfully renewed contracts
  CREATE TEMP TABLE renewed_contracts (id integer);

  -- Process auto-renewal contracts in batches to avoid statement timeout
  IF v_auto_renewal_ids IS NOT NULL AND array_length(v_auto_renewal_ids, 1) > 0 THEN
    FOR i IN 0..((array_length(v_auto_renewal_ids, 1) - 1) / v_batch_size) LOOP
      INSERT INTO renewed_contracts (id)
      SELECT r.id FROM renew_expired_contracts(
        v_auto_renewal_ids[(i * v_batch_size) + 1 : (i + 1) * v_batch_size],
        'active'::contract_status
      ) r;
    END LOOP;
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
    WHERE c.id IN (SELECT rc.id FROM renewed_contracts rc)
  )
  SELECT
    ctu.id as contract_id,
    ctu.old_status,
    CASE
      WHEN ar.id IS NOT NULL THEN ar.new_status
      WHEN ctu.renewal_type = 'Auto' AND ctu.will_not_renew = true THEN 'inactive'::contract_status
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
  DROP TABLE IF EXISTS renewed_contracts;
END;$function$
;
