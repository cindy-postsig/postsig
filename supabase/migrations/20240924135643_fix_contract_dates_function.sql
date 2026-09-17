drop trigger if exists "contract_dates_update" on "public"."contracts";

drop function if exists "public"."update_contract_dates"(contract_id integer, is_cron_job boolean);

drop function if exists "public"."update_contract_dates_and_status"(contract_id integer, is_cron_job boolean);

drop function if exists "public"."update_contract_dates_on_change"();

drop function if exists "public"."update_contracts_daily"();

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.check_expiring_contracts()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  UPDATE contracts
  SET status = 'unconfirmed'
  WHERE status != 'inactive'
    AND current_term_end_date <= CURRENT_DATE;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.run_daily_contract_updates()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM check_expiring_contracts();
  PERFORM update_current_dates();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_current_dates()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  contract_record RECORD;
  new_term_end_date DATE;
BEGIN
  FOR contract_record IN
    SELECT *
    FROM contracts
    WHERE status != 'inactive'
      AND current_term_end_date <= CURRENT_DATE
  LOOP
    -- Calculate new term end date
    new_term_end_date := CASE
      WHEN contract_record.subscription_term = 'Quarterly'
      THEN contract_record.current_term_end_date + INTERVAL '3 months'
      ELSE contract_record.current_term_end_date + INTERVAL '1 year'
    END;

    -- Update the contract
    UPDATE contracts
    SET
      current_term_start_date = contract_record.current_term_end_date + INTERVAL '1 day',
      current_term_end_date = new_term_end_date,
      current_cancel_by_date = new_term_end_date - (contract_record.cancel_by_date || ' days')::INTERVAL
    WHERE id = contract_record.id;
  END LOOP;
END;
$function$
;
