alter table "public"."contracts" add column "current_cancel_by_date" date;

alter table "public"."contracts" add column "current_term_end_date" date;

set check_function_bodies = off;

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
            current_term_end_date = current_term_end_date + INTERVAL '1 year',
            current_cancel_by_date = CASE 
                WHEN contracts.cancel_by_date IS NOT NULL 
                THEN (current_term_end_date + INTERVAL '1 year') - (contracts.cancel_by_date * INTERVAL '1 day')
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


