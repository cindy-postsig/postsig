CREATE OR REPLACE FUNCTION public.update_contract_dates_and_status(contract_id integer, is_cron_job boolean)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    updated BOOLEAN;
    old_current_term_end_date DATE;
    old_current_term_start_date DATE;
    old_status contract_status;  -- Changed from VARCHAR(20) to contract_status
BEGIN
    -- First, retrieve the current values
    SELECT current_term_end_date, current_term_start_date, status
    INTO old_current_term_end_date, old_current_term_start_date, old_status
    FROM contracts
    WHERE id = contract_id;

    -- Now, update the contract
    WITH updated AS (
        UPDATE contracts
        SET
            status =
                CASE
                    WHEN CURRENT_DATE > old_current_term_end_date AND old_status != 'inactive'::contract_status
                    THEN 'unconfirmed'::contract_status
                    ELSE old_status
                END,
            current_term_start_date =
                CASE
                    WHEN CURRENT_DATE <= old_current_term_end_date THEN old_current_term_start_date
                    WHEN subscription_term = 'Annually' THEN (old_current_term_end_date + INTERVAL '1 DAY')::DATE
                    WHEN subscription_term = 'Quarterly' THEN (old_current_term_end_date + INTERVAL '1 DAY')::DATE
                    ELSE (old_current_term_end_date + INTERVAL '1 DAY')::DATE
                END,
            current_term_end_date =
                CASE
                    WHEN CURRENT_DATE <= old_current_term_end_date THEN old_current_term_end_date
                    WHEN subscription_term = 'Annually' THEN (old_current_term_end_date + INTERVAL '1 YEAR')::DATE
                    WHEN subscription_term = 'Quarterly' THEN (old_current_term_end_date + INTERVAL '3 MONTHS')::DATE
                    ELSE (old_current_term_end_date + INTERVAL '1 YEAR')::DATE
                END,
            current_cancel_by_date =
                CASE
                    WHEN cancel_by_date IS NOT NULL THEN
                        CASE
                            WHEN old_current_term_end_date > CURRENT_DATE THEN
                                old_current_term_end_date - (cancel_by_date * INTERVAL '1 DAY')
                            ELSE
                                CASE
                                    WHEN subscription_term = 'Annually' THEN (old_current_term_end_date + INTERVAL '1 YEAR')::DATE - (cancel_by_date * INTERVAL '1 DAY')
                                    WHEN subscription_term = 'Quarterly' THEN (old_current_term_end_date + INTERVAL '3 MONTHS')::DATE - (cancel_by_date * INTERVAL '1 DAY')
                                    ELSE (old_current_term_end_date + INTERVAL '1 YEAR')::DATE - (cancel_by_date * INTERVAL '1 DAY')
                                END
                        END
                    ELSE NULL
                END
        WHERE id = contract_id
          AND (
              (is_cron_job AND old_current_term_end_date < CURRENT_DATE)
              OR
              NOT is_cron_job
          )
        RETURNING *
    )
    SELECT EXISTS (SELECT 1 FROM updated) INTO updated;
    RETURN updated;
END;
$function$
;
