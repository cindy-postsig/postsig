create extension if not exists "http" with schema "extensions";

alter table "public"."vendors" add column "description" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.initialize_all_vendor_descriptions()
 RETURNS TABLE(vendor_id integer, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  vendor_rec RECORD;
  update_result TEXT;
BEGIN
  FOR vendor_rec IN SELECT id FROM vendors WHERE domain IS NOT NULL AND domain != ''
  LOOP
    BEGIN
      update_result := update_vendor_description(vendor_rec.id);
      vendor_id := vendor_rec.id;
      status := 'SUCCESS: ' || update_result;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      vendor_id := vendor_rec.id;
      status := 'ERROR: ' || SQLERRM || ' | ' || update_result;
      RETURN NEXT;
    END;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trigger_update_vendor_description()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Only proceed if the domain is not null and has changed
  IF NEW.domain IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.domain IS DISTINCT FROM NEW.domain) THEN
    PERFORM update_vendor_description(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_vendor_description(vendor_id integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  vendor_domain TEXT;
  brandfetch_response JSONB;
  companies_response JSONB;
  fetched_description TEXT;
  log_message TEXT := '';
BEGIN
  -- Get the vendor's domain
  SELECT domain INTO vendor_domain
  FROM vendors
  WHERE id = vendor_id;

  log_message := log_message || 'Processing vendor ' || vendor_id || ' with domain ' || COALESCE(vendor_domain, 'NULL') || '. ';

  -- Only proceed if we have a domain
  IF vendor_domain IS NOT NULL AND vendor_domain != '' THEN
    -- Fetch data from BrandFetch API
    BEGIN
      SELECT content::jsonb INTO brandfetch_response
      FROM http((
        'GET',
        'https://api.brandfetch.io/v2/brands/' || vendor_domain,
        ARRAY[
          ('Content-Type', 'application/json'),
          ('Authorization', 'Bearer ' || current_setting('env.brandfetch_api_key'))
        ]::http_header[],
        NULL,
        NULL
      )::http_request);

      log_message := log_message || 'BrandFetch API call successful. ';
      -- Try to get the description from BrandFetch
      fetched_description := brandfetch_response->>'longDescription';
    EXCEPTION WHEN OTHERS THEN
      log_message := log_message || 'BrandFetch API call failed: ' || SQLERRM || '. ';
    END;

    -- If no description from BrandFetch, try Companies API
    IF fetched_description IS NULL OR fetched_description = '' THEN
      BEGIN
        SELECT content::jsonb INTO companies_response
        FROM http((
          'GET',
          'https://api.thecompaniesapi.com/v2/companies/' || vendor_domain || '?token=' || current_setting('env.companies_api_key'),
          ARRAY[('Content-Type', 'application/json')]::http_header[],
          NULL,
          NULL
        )::http_request);

        log_message := log_message || 'Companies API call successful. ';
        fetched_description := companies_response->>'descriptions.primary';
      EXCEPTION WHEN OTHERS THEN
        log_message := log_message || 'Companies API call failed: ' || SQLERRM || '. ';
      END;
    END IF;

    -- Update the vendor's description if we fetched a non-empty description
    IF fetched_description IS NOT NULL AND fetched_description != '' THEN
      UPDATE vendors
      SET description = fetched_description
      WHERE id = vendor_id;
      log_message := log_message || 'Description updated successfully.';
    ELSE
      log_message := log_message || 'No new description fetched.';
    END IF;
  ELSE
    log_message := log_message || 'No valid domain found.';
  END IF;

  RETURN log_message;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.contract_search(contracts)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  SELECT
    coalesce($1.summary, '') || ' ' ||
    coalesce((
      SELECT string_agg(v.name || ' ' || v.description, ' ')
      FROM vendors v
      WHERE v.id = $1.vendor_id
    ), '') || ' ' ||
    coalesce((
      SELECT string_agg(vp.name, ' ')
      FROM vendor_products_details vpd
      JOIN vendor_products vp ON vpd.product_id = vp.id
      WHERE vpd.contract_id = $1.id
    ), '')
$function$
;

CREATE TRIGGER update_vendor_description AFTER INSERT OR UPDATE OF domain ON public.vendors FOR EACH ROW EXECUTE FUNCTION trigger_update_vendor_description();
