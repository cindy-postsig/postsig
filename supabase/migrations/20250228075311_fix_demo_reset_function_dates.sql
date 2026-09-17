CREATE OR REPLACE FUNCTION public.update_demo_contracts()
 RETURNS void
 LANGUAGE plpgsql
AS $function$BEGIN
  -- Update contracts 34, 186, and 227 to 'unconfirmed' if they're not already
  UPDATE public.contracts
  SET status = 'unconfirmed'
  WHERE id IN (186)
    AND status != 'unconfirmed';

  -- Reset term_start_date to only contain the first entry from its current array
  UPDATE public.contracts
  SET term_start_date = jsonb_build_array(term_start_date->0)
  WHERE jsonb_array_length(term_start_date) > 1
    AND id IN (186);

  -- Reset term_end_date to only contain the first entry from its current array
  UPDATE public.contracts
  SET term_end_date = jsonb_build_array(term_end_date->0)
  WHERE jsonb_array_length(term_end_date) > 1
    AND id IN (186);

  -- Update contract 36 to 'inactive'
  UPDATE public.contracts
  SET status = 'inactive'
  WHERE id = 36
  AND status = 'active';
END;$function$
;
