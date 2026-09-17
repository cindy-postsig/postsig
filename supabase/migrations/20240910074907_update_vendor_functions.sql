drop function if exists "public"."update_vendor_description"(vendor_id integer);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fetch_vendor_data(vendor_id integer)
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  vendor_domain TEXT;
  vendor_name TEXT;
  cleaned_vendor_name TEXT;
  decoded_vendor_name TEXT;
  brandfetch_response JSONB;
  companies_response JSONB;
  clearbit_response JSONB;
  clearbit_company JSONB;
  fetched_description TEXT;
  log_message TEXT := '';
  clearbit_company_name TEXT;
  companies_api_token TEXT := 'isSeqeQN';
  companies_company JSONB;
  companies_company_name TEXT;
BEGIN
  -- Get the vendor's domain and name
  SELECT domain, name INTO vendor_domain, vendor_name
  FROM vendors
  WHERE id = vendor_id;

  log_message := log_message || 'Processing vendor ' || vendor_id || ' with domain ' || COALESCE(vendor_domain, 'NULL') || '. ';

  -- Initial vendor name cleanup
  cleaned_vendor_name := REPLACE(vendor_name, ' ', '%20');
  cleaned_vendor_name := REGEXP_REPLACE(cleaned_vendor_name, '[.,"]', '', 'g');
  cleaned_vendor_name := REGEXP_REPLACE(cleaned_vendor_name, '(ltd|llc|inc|international%20sl)', '', 'gi');
  cleaned_vendor_name := REGEXP_REPLACE(cleaned_vendor_name, '\(.*?\)', '', 'g');

  -- Remove any leading or trailing spaces left after replacements
  cleaned_vendor_name := TRIM(cleaned_vendor_name);

  -- Decode URL-encoded spaces back to normal spaces for comparison
  decoded_vendor_name := TRIM(REPLACE(cleaned_vendor_name, '%20', ' '));

  log_message := log_message || 'Cleaned vendor name: ' || cleaned_vendor_name || '. ';
  log_message := log_message || 'Decoded vendor name: ' || decoded_vendor_name || '. ';

  -- If no domain is found, first search Companies API using the cleaned vendor name
  IF vendor_domain IS NULL OR vendor_domain = '' THEN
    BEGIN
      -- Fetch Companies API data
      SELECT content::jsonb INTO companies_response
      FROM http((
        'GET',
        'https://api.thecompaniesapi.com/v2/companies/by-name?name=' || decoded_vendor_name || '&exactWordsMatch=true&token=' || companies_api_token,
        ARRAY[('Content-Type', 'application/json')]::http_header[],
        NULL,
        NULL
      )::http_request);

      log_message := log_message || 'Companies API call successful. ';

      -- Iterate over each company in the Companies API response
      FOR companies_company IN
        SELECT value
        FROM jsonb_array_elements(companies_response->'companies') AS value
      LOOP
        -- Extract the company name from the JSONB response
        companies_company_name := TRIM(LOWER(companies_company->'about'->>'name'));

        -- Log the comparison being made
        log_message := log_message || 'Comparing Companies API name: ' || companies_company_name || ' with Decoded vendor name: ' || LOWER(decoded_vendor_name) || '. ';

        -- Perform stricter comparison
        IF companies_company_name = LOWER(decoded_vendor_name) THEN
          vendor_domain := companies_company->'domain'->>'domain';
          log_message := log_message || 'Exact match found in Companies API with domain: ' || vendor_domain || '. ';
          EXIT; -- Exit the loop on the first exact match
        END IF;
      END LOOP;

      -- Log if no match was found
      IF vendor_domain IS NULL OR vendor_domain = '' THEN
        log_message := log_message || 'No exact match found in Companies API, fallback to Clearbit API. ';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      log_message := log_message || 'Companies API call failed: ' || SQLERRM || '. Fallback to Clearbit API. ';
    END;
  END IF;

  -- If still no domain is found, fallback to Clearbit API
  IF vendor_domain IS NULL OR vendor_domain = '' THEN
    BEGIN
      -- Fetch Clearbit data
      SELECT content::jsonb INTO clearbit_response
      FROM http((
        'GET',
        'https://autocomplete.clearbit.com/v1/companies/suggest?query=' || cleaned_vendor_name,
        ARRAY[('Content-Type', 'application/json')]::http_header[],
        NULL,
        NULL
      )::http_request);

      log_message := log_message || 'Clearbit API call successful. ';

      -- Iterate over each company in the Clearbit response
      FOR clearbit_company IN
        SELECT value
        FROM jsonb_array_elements(clearbit_response) AS value
      LOOP
        -- Extract the company name from the JSONB response
        clearbit_company_name := TRIM(LOWER(clearbit_company->>'name'));

        -- Log the comparison being made
        log_message := log_message || 'Comparing Clearbit name: ' || clearbit_company_name || ' with Decoded vendor name: ' || LOWER(decoded_vendor_name) || '. ';

        -- Perform stricter comparison
        IF clearbit_company_name = LOWER(decoded_vendor_name) THEN
          vendor_domain := clearbit_company->>'domain';
          log_message := log_message || 'Exact match found in Clearbit with domain: ' || vendor_domain || '. ';
          EXIT; -- Exit the loop on the first exact match
        END IF;
      END LOOP;

      -- Log if no match was found
      IF vendor_domain IS NULL OR vendor_domain = '' THEN
        log_message := log_message || 'No exact match found in Clearbit API for vendor name.';
      END IF;

    EXCEPTION WHEN OTHERS THEN
      log_message := log_message || 'Clearbit API call failed: ' || SQLERRM || '. ';
    END;
  END IF;

  -- Only proceed if we have a domain or fetched a new one
  IF vendor_domain IS NOT NULL AND vendor_domain != '' THEN
    -- Fetch data from BrandFetch API
    BEGIN
      SELECT content::jsonb INTO brandfetch_response
      FROM http((
        'GET',
        'https://api.brandfetch.io/v2/brands/' || vendor_domain,
        ARRAY[
          ('Content-Type', 'application/json'),
          ('Authorization', 'Bearer ' || '4UZ13zgIacxm8V/TUmRo+o3TIehp2xByAcuVDko0GuE=')
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
          'https://api.thecompaniesapi.com/v2/companies/' || vendor_domain || '?token=' || companies_api_token,
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
  END IF;

  -- Update the vendor's description if fetched successfully, but only set domain if it was missing
  IF vendor_domain IS NOT NULL AND vendor_domain != '' THEN
    UPDATE vendors
    SET domain = COALESCE(NULLIF(vendors.domain, ''), vendor_domain), -- Only set the domain if it was NULL or empty
        description = COALESCE(fetched_description, description)
    WHERE id = vendor_id;

    log_message := log_message || 'Description updated successfully. ';

    IF vendor_domain IS NOT NULL THEN
      log_message := log_message || 'Domain updated successfully.';
    END IF;
  ELSE
    log_message := log_message || 'No new domain or description fetched.';
  END IF;

  RETURN log_message;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.initialize_all_vendor_descriptions()
 RETURNS TABLE(vendor_id integer, status text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  vendor_rec RECORD;
  update_result TEXT;
BEGIN
  -- Loop through all vendors
  FOR vendor_rec IN SELECT id FROM vendors
  LOOP
    BEGIN
      -- Call the updated function that handles domain fetching
      update_result := fetch_vendor_data(vendor_rec.id);

      -- Record the result for each vendor
      vendor_id := vendor_rec.id;
      status := 'SUCCESS: ' || update_result;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      -- Capture errors and continue processing the next vendor
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
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.domain IS DISTINCT FROM OLD.domain) THEN
    -- Check if the domain is NULL or an empty string
    IF NEW.domain IS NULL OR NEW.domain = '' THEN
      RAISE NOTICE 'Domain was set to NULL or empty for vendor %, skipping fetch.', NEW.id;
    ELSE
      PERFORM fetch_vendor_data(NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
