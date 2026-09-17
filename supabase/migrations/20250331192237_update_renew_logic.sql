CREATE OR REPLACE FUNCTION public.renew_expired_contracts(p_contract_ids integer[], p_new_status contract_status)
 RETURNS SETOF contracts
 LANGUAGE plpgsql
AS $function$DECLARE
  v_contract record;
  v_period_start date;
  v_period_end date;
  v_original_end date;
  v_interval interval;
  v_term text;
  v_months integer;
BEGIN
  -- Process each contract
  FOR v_contract IN
    SELECT *
    FROM contracts
    WHERE id = ANY(p_contract_ids)
  LOOP
    -- Get the original end date
    v_original_end := (v_contract.term_end_date->0->>'date')::date;

    -- Calculate the renewal interval based on renewal_period first, then fallback to subscription_term
    IF v_contract.renewal_period IS NOT NULL THEN
      -- Use renewal_period (months) directly
      v_months := v_contract.renewal_period;
    ELSE
      -- Try to interpret subscription_term
      v_term := v_contract.subscription_term;

      IF v_term IS NULL THEN
        -- Default to 12 months (1 year) when both renewal_period and subscription_term are NULL
        v_months := 12;
      ELSIF v_term ~ '^\d+$' THEN
        -- If subscription_term is just a number, interpret it as months
        v_months := v_term::integer;
      ELSIF v_term ILIKE 'annual%' THEN
        v_months := 12;
      ELSIF v_term ILIKE 'quarterly%' THEN
        v_months := 3;
      ELSIF v_term ILIKE 'monthly%' THEN
        v_months := 1;
      ELSE
        -- For any other case, default to 12 months (1 year)
        v_months := 12;
      END IF;
    END IF;

    -- Convert months to interval
    v_interval := (v_months || ' months')::interval;

    -- Start from the original end date and keep advancing until we find the current period
    v_period_start := v_original_end + interval '1 day';
    v_period_end := v_period_start + v_interval - interval '1 day';

    -- Keep advancing the period until we find one that includes current date
    WHILE v_period_end < CURRENT_DATE LOOP
      v_period_start := v_period_end + interval '1 day';
      v_period_end := v_period_start + v_interval - interval '1 day';
    END LOOP;

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
END;$function$
;
