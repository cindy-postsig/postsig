set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_contract_dates(contract_id integer, is_cron_job boolean DEFAULT false)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    updated BOOLEAN;
BEGIN
    WITH updated AS (
        UPDATE contracts
        SET
            current_term_end_date = 
                CASE 
                    WHEN term_end_date > CURRENT_DATE THEN
                        term_end_date -- Use term_end_date if it's in the future
                    WHEN subscription_term = 'Annually' THEN
                        (term_end_date + ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM term_end_date) + 
                            CASE 
                                WHEN (EXTRACT(MONTH FROM term_end_date), EXTRACT(DAY FROM term_end_date)) > 
                                    (EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE))
                                THEN 0
                                ELSE 1
                            END
                        ) * INTERVAL '1 YEAR'))::DATE
                    WHEN subscription_term = 'Quarterly' THEN
                        term_end_date + 
                        ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM term_end_date)) * 4 +
                         CEIL((EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM term_end_date)) / 3.0))::INTEGER * INTERVAL '3 MONTHS'
                    ELSE
                        (term_end_date + ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM term_end_date) + 1) * INTERVAL '1 YEAR'))::DATE
                END,
            current_cancel_by_date = 
                CASE
                    WHEN cancel_by_date IS NOT NULL THEN
                        CASE 
                            WHEN term_end_date > CURRENT_DATE THEN
                                term_end_date - (cancel_by_date * INTERVAL '1 DAY')
                            ELSE
                                (term_end_date + ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM term_end_date) + 1) * INTERVAL '1 YEAR'))::DATE - (cancel_by_date * INTERVAL '1 DAY')
                        END
                    ELSE NULL
                END
        WHERE id = contract_id 
          AND (
              (is_cron_job AND term_end_date < CURRENT_DATE) 
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


