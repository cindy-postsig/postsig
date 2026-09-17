set check_function_bodies = off;

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
          ('Authorization', 'Bearer ' || current_setting('vault.brandfetch_api_key'))
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
          'https://api.thecompaniesapi.com/v2/companies/' || vendor_domain || '?token=' || current_setting('vault.companies_api_key'),
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
