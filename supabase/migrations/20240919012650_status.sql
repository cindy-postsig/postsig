create type "public"."contract_status" as enum ('unconfirmed', 'active', 'inactive');

alter table "public"."contracts" drop column "active";

alter table "public"."contracts" add column "current_term_start_date" date;

alter table "public"."contracts" add column "status" contract_status not null default 'unconfirmed'::contract_status;

CREATE INDEX contracts_status_idx ON public.contracts USING btree (status);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_contract_dates_and_status(contract_id integer, is_cron_job boolean)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
    updated BOOLEAN;
    old_current_term_end_date DATE;
    old_current_term_start_date DATE;
    old_status VARCHAR(20);
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
                    WHEN CURRENT_DATE > old_current_term_end_date AND old_status != 'inactive' THEN 'unconfirmed'
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

CREATE OR REPLACE FUNCTION public.update_contract_dates_on_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Call the update function for this specific contract
    PERFORM update_contract_dates_and_status(NEW.id, FALSE);
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
        IF update_contract_dates_and_status(contract_record.id, TRUE) THEN
            updated_count := updated_count + 1;
        END IF;
    END LOOP;
    RETURN updated_count;
END;
$function$
;
