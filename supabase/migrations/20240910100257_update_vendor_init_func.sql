create table "public"."vendor_processing_log" (
    "vendor_id" integer not null,
    "processed_at" timestamp without time zone,
    "status" text
);

CREATE UNIQUE INDEX vendor_processing_log_pkey ON public.vendor_processing_log USING btree (vendor_id);

alter table "public"."vendor_processing_log" add constraint "vendor_processing_log_pkey" PRIMARY KEY using index "vendor_processing_log_pkey";

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

  -- If we already have a domain and description, exit early
  IF vendor_domain IS NOT NULL AND vendor_domain != '' AND
     EXISTS (SELECT 1 FROM vendors WHERE id = vendor_id AND description IS NOT NULL AND description != '') THEN
    RETURN 'Vendor already has domain and description. No API calls made.';
  END IF;

  -- Initial vendor name cleanup
  cleaned_vendor_name := REPLACE(vendor_name, ' ', '%20');
  cleaned_vendor_name := REGEXP_REPLACE(cleaned_vendor_name, '[.,"]', '', 'g');
  cleaned_vendor_name := REGEXP_REPLACE(cleaned_vendor_name, '(ltd|llc|inc|international%20sl)', '', 'gi');
  cleaned_vendor_name := REGEXP_REPLACE(cleaned_vendor_name, '\(.*?\)', '', 'g');
  cleaned_vendor_name := TRIM(cleaned_vendor_name);
  decoded_vendor_name := TRIM(REPLACE(cleaned_vendor_name, '%20', ' '));

  log_message := log_message || 'Cleaned vendor name: ' || cleaned_vendor_name || '. ';
  log_message := log_message || 'Decoded vendor name: ' || decoded_vendor_name || '. ';

  -- Only search for domain if it's missing
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
        companies_company_name := TRIM(LOWER(companies_company->'about'->>'name'));
        log_message := log_message || 'Comparing Companies API name: ' || companies_company_name || ' with Decoded vendor name: ' || LOWER(decoded_vendor_name) || '. ';

        IF companies_company_name = LOWER(decoded_vendor_name) THEN
          vendor_domain := companies_company->'domain'->>'domain';
          log_message := log_message || 'Exact match found in Companies API with domain: ' || vendor_domain || '. ';
          EXIT;
        END IF;
      END LOOP;

      -- If still no domain, try Clearbit API
      IF vendor_domain IS NULL OR vendor_domain = '' THEN
        SELECT content::jsonb INTO clearbit_response
        FROM http((
          'GET',
          'https://autocomplete.clearbit.com/v1/companies/suggest?query=' || cleaned_vendor_name,
          ARRAY[('Content-Type', 'application/json')]::http_header[],
          NULL,
          NULL
        )::http_request);

        log_message := log_message || 'Clearbit API call successful. ';

        FOR clearbit_company IN
          SELECT value
          FROM jsonb_array_elements(clearbit_response) AS value
        LOOP
          clearbit_company_name := TRIM(LOWER(clearbit_company->>'name'));
          log_message := log_message || 'Comparing Clearbit name: ' || clearbit_company_name || ' with Decoded vendor name: ' || LOWER(decoded_vendor_name) || '. ';

          IF clearbit_company_name = LOWER(decoded_vendor_name) THEN
            vendor_domain := clearbit_company->>'domain';
            log_message := log_message || 'Exact match found in Clearbit with domain: ' || vendor_domain || '. ';
            EXIT;
          END IF;
        END LOOP;
      END IF;

    EXCEPTION WHEN OTHERS THEN
      log_message := log_message || 'API calls for domain search failed: ' || SQLERRM || '. ';
    END;
  END IF;

  -- Only proceed to fetch description if we have a domain
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
      fetched_description := brandfetch_response->>'longDescription';

      -- If no description from BrandFetch, try Companies API
      IF fetched_description IS NULL OR fetched_description = '' THEN
        SELECT content::jsonb INTO companies_response
        FROM http((
          'GET',
          'https://api.thecompaniesapi.com/v2/companies/' || vendor_domain || '?token=' || companies_api_token,
          ARRAY[('Content-Type', 'application/json')]::http_header[],
          NULL,
          NULL
        )::http_request);

        log_message := log_message || 'Companies API call for description successful. ';
        fetched_description := companies_response->>'descriptions.primary';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      log_message := log_message || 'API calls for description failed: ' || SQLERRM || '. ';
    END;
  END IF;

  -- Update the vendor's information
  UPDATE vendors
  SET
    domain = COALESCE(NULLIF(vendors.domain, ''), vendor_domain),
    description = COALESCE(fetched_description, description)
  WHERE id = vendor_id;

  log_message := log_message || 'Vendor information updated. ';

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
  -- Select a single unprocessed vendor
  SELECT id INTO vendor_rec
  FROM vendors
  WHERE NOT EXISTS (
    SELECT 1
    FROM vendor_processing_log
    WHERE vendor_processing_log.vendor_id = vendors.id
  )
  LIMIT 1;

  -- If no unprocessed vendor is found, return NULL
  IF vendor_rec IS NULL THEN
    vendor_id := NULL;
    status := 'No unprocessed vendors found';
    RETURN NEXT;
    RETURN;
  END IF;

  BEGIN
    -- Call the updated function that handles domain fetching
    update_result := fetch_vendor_data(vendor_rec.id);

    -- Record the result for the vendor
    vendor_id := vendor_rec.id;
    status := 'SUCCESS: ' || update_result;

    -- Log the successful processing
    INSERT INTO vendor_processing_log (vendor_id, processed_at, status)
    VALUES (vendor_rec.id, NOW(), 'SUCCESS');

  EXCEPTION WHEN OTHERS THEN
    -- Capture errors
    vendor_id := vendor_rec.id;
    status := 'ERROR: ' || SQLERRM || ' | ' || update_result;

    -- Log the failed processing
    INSERT INTO vendor_processing_log (vendor_id, processed_at, status)
    VALUES (vendor_rec.id, NOW(), 'ERROR');

  END;

  RETURN NEXT;
END;
$function$
;

grant delete on table "public"."vendor_processing_log" to "anon";

grant insert on table "public"."vendor_processing_log" to "anon";

grant references on table "public"."vendor_processing_log" to "anon";

grant select on table "public"."vendor_processing_log" to "anon";

grant trigger on table "public"."vendor_processing_log" to "anon";

grant truncate on table "public"."vendor_processing_log" to "anon";

grant update on table "public"."vendor_processing_log" to "anon";

grant delete on table "public"."vendor_processing_log" to "authenticated";

grant insert on table "public"."vendor_processing_log" to "authenticated";

grant references on table "public"."vendor_processing_log" to "authenticated";

grant select on table "public"."vendor_processing_log" to "authenticated";

grant trigger on table "public"."vendor_processing_log" to "authenticated";

grant truncate on table "public"."vendor_processing_log" to "authenticated";

grant update on table "public"."vendor_processing_log" to "authenticated";

grant delete on table "public"."vendor_processing_log" to "service_role";

grant insert on table "public"."vendor_processing_log" to "service_role";

grant references on table "public"."vendor_processing_log" to "service_role";

grant select on table "public"."vendor_processing_log" to "service_role";

grant trigger on table "public"."vendor_processing_log" to "service_role";

grant truncate on table "public"."vendor_processing_log" to "service_role";

grant update on table "public"."vendor_processing_log" to "service_role";
