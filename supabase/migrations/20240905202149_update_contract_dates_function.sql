set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_contract_dates_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Only update if certain fields have changed
    IF NEW.term_end_date != OLD.term_end_date OR 
       NEW.cancel_by_date != OLD.cancel_by_date OR 
       NEW.subscription_term != OLD.subscription_term THEN
        
        -- Call the update function for this specific contract
        PERFORM update_contracts_daily();
    END IF;
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_contracts_daily()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    updated_count integer;
BEGIN
    -- Update contracts where the current term end date has passed
    WITH updated AS (
        UPDATE contracts
        SET
            current_term_end_date = 
                CASE 
                    WHEN subscription_term = 'Annually' THEN
                        make_date(
                            EXTRACT(YEAR FROM CURRENT_DATE)::integer + 
                            CASE 
                                WHEN (EXTRACT(MONTH FROM current_term_end_date), EXTRACT(DAY FROM current_term_end_date)) <= 
                                     (EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE))
                                THEN 1
                                ELSE 0
                            END,
                            EXTRACT(MONTH FROM current_term_end_date)::integer,
                            EXTRACT(DAY FROM current_term_end_date)::integer
                        )
                    WHEN subscription_term = 'Quarterly' THEN
                        current_term_end_date + 
                        ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM current_term_end_date)) * 4 +
                         CEIL((EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM current_term_end_date)) / 3.0))::integer * INTERVAL '3 months'
                    ELSE
                        current_term_end_date + INTERVAL '1 year'
                END,
            current_cancel_by_date = 
                CASE
                    WHEN cancel_by_date IS NOT NULL THEN
                        CASE 
                            WHEN subscription_term = 'Annually' THEN
                                make_date(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::integer + 
                                    CASE 
                                        WHEN (EXTRACT(MONTH FROM current_term_end_date), EXTRACT(DAY FROM current_term_end_date)) <= 
                                             (EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE))
                                        THEN 1
                                        ELSE 0
                                    END,
                                    EXTRACT(MONTH FROM current_term_end_date)::integer,
                                    EXTRACT(DAY FROM current_term_end_date)::integer
                                ) - (cancel_by_date * INTERVAL '1 day')
                            WHEN subscription_term = 'Quarterly' THEN
                                (current_term_end_date + 
                                ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM current_term_end_date)) * 4 +
                                 CEIL((EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM current_term_end_date)) / 3.0))::integer * INTERVAL '3 months')
                                - (cancel_by_date * INTERVAL '1 day')
                            ELSE
                                (current_term_end_date + INTERVAL '1 year') - (cancel_by_date * INTERVAL '1 day')
                        END
                    ELSE NULL
                END
        WHERE current_term_end_date < CURRENT_DATE
        RETURNING *
    )
    SELECT COUNT(*) INTO updated_count FROM updated;
    RETURN updated_count;
END;
$function$
;

CREATE TRIGGER contract_update_trigger AFTER UPDATE ON public.contracts FOR EACH ROW EXECUTE FUNCTION update_contract_dates_on_change();


