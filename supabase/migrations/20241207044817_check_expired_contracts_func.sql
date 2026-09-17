CREATE OR REPLACE FUNCTION public.check_expired_contracts()
 RETURNS TABLE(contract_id integer, old_status contract_status, new_status contract_status, end_date date)
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Update contracts where term_end_date matches today's date
    -- and return the affected contracts
    RETURN QUERY
    WITH updated_contracts AS (
        UPDATE contracts c
        SET status = 'unconfirmed'::contract_status
        WHERE
            -- Check if the most recent term_end_date (first in array) is today
            (c.term_end_date->0->>'date')::date = CURRENT_DATE
            -- Only update if status isn't already unconfirmed
            AND status != 'unconfirmed'::contract_status
        RETURNING
            id,
            status as new_status,
            (term_end_date->0->>'date')::date as end_date,
            -- Get the status from before the update
            lag(status) over () as old_status
    )
    SELECT
        id as contract_id,
        old_status,
        new_status,
        end_date
    FROM updated_contracts;
END;
$function$
;
