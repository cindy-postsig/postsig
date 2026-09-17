CREATE OR REPLACE FUNCTION public.update_demo_contracts()
 RETURNS void
 LANGUAGE plpgsql
AS $function$BEGIN
  -- Update contracts 34, 186, and 227 to 'unconfirmed' if they're not already
  UPDATE public.contracts
  SET status = 'unconfirmed'
  WHERE id IN (186)
    AND status != 'unconfirmed';

  -- Reset the dates
  UPDATE public.contracts
  SET dates = jsonb_build_array(dates->0)
  WHERE jsonb_array_length(dates) > 1
    AND id IN (186);

  -- Update contract 36 to 'inactive'
  UPDATE public.contracts
  SET status = 'inactive'
  WHERE id = 36
  AND status = 'active';
END;$function$
;
