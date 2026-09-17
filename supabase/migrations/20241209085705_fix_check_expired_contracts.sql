CREATE OR REPLACE FUNCTION public.check_expired_contracts()
RETURNS TABLE(contract_id integer, old_status contract_status, new_status contract_status, end_date date)
LANGUAGE plpgsql
AS $function$
BEGIN
    -- Create a temporary table to store contracts that need updating
    CREATE TEMP TABLE contracts_to_update AS
    SELECT
        id,
        status as old_status,
        (term_end_date->0->>'date')::date as end_date
    FROM contracts c
    WHERE
        (c.term_end_date->0->>'date')::date <= CURRENT_DATE
        AND status = 'active'::contract_status
        AND c.term_end_date->0->>'date' IS NOT NULL;

    -- Update the contracts and return the results
    RETURN QUERY
    WITH updated_contracts AS (
        UPDATE contracts c
        SET status = 'unconfirmed'::contract_status
        FROM contracts_to_update ctu
        WHERE c.id = ctu.id
        RETURNING
            c.id,
            'unconfirmed'::contract_status as new_status,
            (c.term_end_date->0->>'date')::date as end_date
    )
    SELECT
        uc.id as contract_id,
        ctu.old_status,
        uc.new_status,
        uc.end_date
    FROM updated_contracts uc
    JOIN contracts_to_update ctu ON uc.id = ctu.id;

    -- Clean up
    DROP TABLE contracts_to_update;
END;
$function$;
