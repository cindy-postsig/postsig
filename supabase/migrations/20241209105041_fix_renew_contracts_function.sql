CREATE OR REPLACE FUNCTION public.renew_expired_contracts(p_contract_ids integer[], p_new_status contract_status)
 RETURNS SETOF contracts
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_contract record;
  v_period_start date;
  v_period_end date;
  v_original_end date;
  v_interval interval;
  v_term text;
BEGIN
  -- Process each contract
  FOR v_contract IN
    SELECT *
    FROM contracts
    WHERE id = ANY(p_contract_ids)
  LOOP
    -- Get the original end date
    v_original_end := (v_contract.term_end_date->0->>'date')::date;

    -- Handle NULL subscription_term by defaulting to annual
    v_term := COALESCE(v_contract.subscription_term, 'annual');

    IF v_term ILIKE 'annual%' OR NOT (v_term ILIKE 'quarterly%' OR v_term ILIKE 'monthly%') THEN
      -- Start from the original end date and keep advancing until we find the current period
      v_period_start := v_original_end + interval '1 day';
      v_period_end := v_period_start + interval '1 year' - interval '1 day';
      -- Keep advancing the period until we find one that includes current date
      WHILE v_period_end < CURRENT_DATE LOOP
        v_period_start := v_period_end + interval '1 day';
        v_period_end := v_period_start + interval '1 year' - interval '1 day';
      END LOOP;
    ELSE
      -- For Monthly/Quarterly: set interval based on subscription term
      v_interval := CASE
        WHEN v_term ILIKE 'quarterly%' THEN interval '3 months'
        WHEN v_term ILIKE 'monthly%' THEN interval '1 month'
        ELSE interval '1 year'  -- This case shouldn't be reached due to the IF condition above
      END;
      -- Start from the original end date
      v_period_start := v_original_end + interval '1 day';
      v_period_end := v_period_start + v_interval - interval '1 day';
      -- Keep advancing the period until we find one that includes current date
      WHILE v_period_end < CURRENT_DATE LOOP
        v_period_start := v_period_end + interval '1 day';
        v_period_end := v_period_start + v_interval - interval '1 day';
      END LOOP;
    END IF;

    -- Update the contract with the calculated dates
    UPDATE contracts
    SET
      status = p_new_status,
      term_start_date = jsonb_build_array(
        jsonb_build_object(
          'date', v_period_start,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || term_start_date,
      term_end_date = jsonb_build_array(
        jsonb_build_object(
          'date', v_period_end,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || term_end_date,
      cancel_date = jsonb_build_array(
        jsonb_build_object(
          'date', (v_period_end - (v_contract.cancel_by_date || ' days')::interval)::date,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || cancel_date
    WHERE id = v_contract.id;
  END LOOP;

  -- Return all updated contracts
  RETURN QUERY
  SELECT * FROM contracts WHERE id = ANY(p_contract_ids);
END;
$function$
;
