drop trigger if exists "contract_update_trigger" on "public"."contracts";

drop function if exists "public"."update_single_contract"(contract_id integer);

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
                        make_date(
                            EXTRACT(YEAR FROM CURRENT_DATE)::integer + 
                            CASE 
                                WHEN (EXTRACT(MONTH FROM term_end_date), EXTRACT(DAY FROM term_end_date)) <= 
                                     (EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE))
                                THEN 1
                                ELSE 0
                            END,
                            EXTRACT(MONTH FROM term_end_date)::integer,
                            EXTRACT(DAY FROM term_end_date)::integer
                        )
                    WHEN subscription_term = 'Quarterly' THEN
                        term_end_date + 
                        ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM term_end_date)) * 4 +
                         CEIL((EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM term_end_date)) / 3.0))::integer * INTERVAL '3 months'
                    ELSE
                        term_end_date + 
                        ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM term_end_date)) * INTERVAL '1 year' +
                         CASE 
                             WHEN (EXTRACT(MONTH FROM term_end_date), EXTRACT(DAY FROM term_end_date)) <= 
                                  (EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE))
                             THEN INTERVAL '1 year'
                             ELSE INTERVAL '0 years'
                         END)
                END,
            current_cancel_by_date = 
                CASE
                    WHEN cancel_by_date IS NOT NULL THEN
                        CASE 
                            WHEN term_end_date > CURRENT_DATE THEN
                                term_end_date - (cancel_by_date * INTERVAL '1 day')
                            WHEN subscription_term = 'Annually' THEN
                                make_date(
                                    EXTRACT(YEAR FROM CURRENT_DATE)::integer + 
                                    CASE 
                                        WHEN (EXTRACT(MONTH FROM term_end_date), EXTRACT(DAY FROM term_end_date)) <= 
                                             (EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE))
                                        THEN 1
                                        ELSE 0
                                    END,
                                    EXTRACT(MONTH FROM term_end_date)::integer,
                                    EXTRACT(DAY FROM term_end_date)::integer
                                ) - (cancel_by_date * INTERVAL '1 day')
                            WHEN subscription_term = 'Quarterly' THEN
                                (term_end_date + 
                                ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM term_end_date)) * 4 +
                                 CEIL((EXTRACT(MONTH FROM CURRENT_DATE) - EXTRACT(MONTH FROM term_end_date)) / 3.0))::integer * INTERVAL '3 months')
                                - (cancel_by_date * INTERVAL '1 day')
                            ELSE
                                (term_end_date + 
                                ((EXTRACT(YEAR FROM CURRENT_DATE) - EXTRACT(YEAR FROM term_end_date)) * INTERVAL '1 year' +
                                 CASE 
                                     WHEN (EXTRACT(MONTH FROM term_end_date), EXTRACT(DAY FROM term_end_date)) <= 
                                          (EXTRACT(MONTH FROM CURRENT_DATE), EXTRACT(DAY FROM CURRENT_DATE))
                                     THEN INTERVAL '1 year'
                                     ELSE INTERVAL '0 years'
                                 END))
                                - (cancel_by_date * INTERVAL '1 day')
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

CREATE OR REPLACE FUNCTION public.update_contract_dates_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Call the update function for this specific contract
    PERFORM update_contract_dates(NEW.id, FALSE);
    RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_contracts_daily()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
    updated_count integer := 0;
    contract_record RECORD;
BEGIN
    FOR contract_record IN 
        SELECT id 
        FROM contracts 
        WHERE term_end_date < CURRENT_DATE
    LOOP
        IF update_contract_dates(contract_record.id, TRUE) THEN
            updated_count := updated_count + 1;
        END IF;
    END LOOP;
    RETURN updated_count;
END;
$function$
;

CREATE TRIGGER contract_dates_update AFTER UPDATE OF term_end_date, cancel_by_date, subscription_term ON public.contracts FOR EACH ROW EXECUTE FUNCTION update_contract_dates_on_change();


