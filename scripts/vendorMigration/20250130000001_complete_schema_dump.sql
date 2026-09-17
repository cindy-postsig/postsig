
-- supabase/migrations/20250130000001_complete_schema_dump.sql
-- Complete database schema preservation migration
-- Generated from current database state on 2025-01-30
-- 
-- This migration contains the complete current database schema including:
-- - All extensions
-- - All custom types (enums)
-- - All functions
-- - All tables with proper constraints
-- - All indexes
-- - All triggers
-- - All policies
-- - All grants and permissions
--
-- Purpose: This migration ensures that if you reset the database through 
-- migration files, the schema will be identical to the current state.
-- This is your "master" schema migration for complete database restoration.

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgsodium" WITH SCHEMA "pgsodium";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgjwt" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";






CREATE TYPE "public"."CorporateActionType" AS ENUM (
    'merger',
    'acquisition',
    'name_change',
    'spinoff'
);


ALTER TYPE "public"."CorporateActionType" OWNER TO "postgres";


CREATE TYPE "public"."VendorStatus" AS ENUM (
    'active',
    'inactive',
    'merged',
    'acquired'
);


ALTER TYPE "public"."VendorStatus" OWNER TO "postgres";


CREATE TYPE "public"."ai_extraction_status" AS ENUM (
    'ai_success',
    'ai_failed',
    'h_success',
    'h_failed',
    'ext_failed',
    'ext_success'
);


ALTER TYPE "public"."ai_extraction_status" OWNER TO "postgres";


CREATE TYPE "public"."app_permission" AS ENUM (
    'contracts.select',
    'contracts.update',
    'contracts.delete',
    'contracts.insert',
    'vendor_products.select',
    'vendor_products.update',
    'vendor_products.delete',
    'vendor_products.insert',
    'vendor_products_details.select',
    'vendor_products_details.update',
    'vendor_products_details.delete',
    'vendor_products_details.insert',
    'contract_docs.select',
    'contract_docs.insert',
    'contract_docs.update',
    'activities.select',
    'activities.insert',
    'activities.update',
    'contract_statuses.select',
    'contract_types.select'
);


ALTER TYPE "public"."app_permission" OWNER TO "postgres";


CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'user',
    'extractor',
    'demo'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE TYPE "public"."contract_status" AS ENUM (
    'unconfirmed',
    'active',
    'inactive'
);


ALTER TYPE "public"."contract_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_fetch_user_auth_data"() RETURNS TABLE("id" "uuid", "last_sign_in_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.last_sign_in_at
  FROM auth.users au;
END;
$$;


ALTER FUNCTION "public"."admin_fetch_user_auth_data"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  bind_permissions int;
begin
  select count(*)
  from public.role_permissions
  where role_permissions.permission = authorize.requested_permission
    and (role_permissions.role = (select (auth.jwt() ->> 'user_role')::public.app_role))
  into bind_permissions;

  return bind_permissions > 0;
end;
$$;


ALTER FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_expired_contracts"() RETURNS TABLE("contract_id" integer, "old_status" "public"."contract_status", "new_status" "public"."contract_status", "end_date" "date")
    LANGUAGE "plpgsql"
    AS $$DECLARE
  v_auto_renewal_ids integer[];
BEGIN
  -- Create a temporary table to store contracts that need updating
  CREATE TEMP TABLE contracts_to_update AS
  SELECT
    id,
    status as old_status,
    COALESCE(
      (cancel_date->0->>'date')::date,
      (term_end_date->0->>'date')::date
    ) as effective_end_date,
    renewal_type,
    will_not_renew
  FROM contracts c
  WHERE
    COALESCE(
      (cancel_date->0->>'date')::date,
      (term_end_date->0->>'date')::date
    ) <= CURRENT_DATE
    AND status = 'active'::contract_status;

  -- Store IDs of auto-renewal contracts
  SELECT array_agg(id)
  INTO v_auto_renewal_ids
  FROM contracts_to_update
  WHERE renewal_type = 'Auto' AND (will_not_renew = false OR will_not_renew IS NULL);

  -- Update non-auto renewal contracts to unconfirmed status
  WITH updated_contracts AS (
    UPDATE contracts c
    SET status = 'unconfirmed'::contract_status
    FROM contracts_to_update ctu
    WHERE c.id = ctu.id
    AND (c.renewal_type != 'Auto' OR c.renewal_type IS NULL)
    RETURNING
      c.id,
      'unconfirmed'::contract_status as new_status,
      COALESCE(
        (c.cancel_date->0->>'date')::date,
        (c.term_end_date->0->>'date')::date
      ) as effective_end_date
  )
  INSERT INTO contracts_to_update (id, old_status, effective_end_date, renewal_type)
  SELECT
    uc.id,
    ctu.old_status,
    uc.effective_end_date,
    ctu.renewal_type
  FROM updated_contracts uc
  JOIN contracts_to_update ctu ON uc.id = ctu.id;

  -- Process auto-renewal contracts if any exist
  IF v_auto_renewal_ids IS NOT NULL AND array_length(v_auto_renewal_ids, 1) > 0 THEN
    PERFORM renew_expired_contracts(v_auto_renewal_ids, 'active'::contract_status);
  END IF;

  -- Return all processed contracts
  RETURN QUERY
  WITH auto_renewed AS (
    SELECT
      c.id,
      'active'::contract_status as new_status,
      COALESCE(
        (c.cancel_date->0->>'date')::date,
        (c.term_end_date->0->>'date')::date
      ) as effective_end_date
    FROM contracts c
    WHERE c.id = ANY(COALESCE(v_auto_renewal_ids, ARRAY[]::integer[]))
  )
  SELECT
    ctu.id as contract_id,
    ctu.old_status,
    CASE
      WHEN ar.id IS NOT NULL THEN ar.new_status
      ELSE 'unconfirmed'::contract_status
    END as new_status,
    CASE
      WHEN ar.id IS NOT NULL THEN ar.effective_end_date
      ELSE ctu.effective_end_date
    END as effective_end_date
  FROM contracts_to_update ctu
  LEFT JOIN auto_renewed ar ON ctu.id = ar.id;

  -- Clean up
  DROP TABLE contracts_to_update;
END;$$;


ALTER FUNCTION "public"."check_expired_contracts"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."contracts" (
    "id" integer NOT NULL,
    "vendor_id" integer,
    "cancel_by_date" integer,
    "auto_renewal" boolean,
    "billing_frequency" character varying,
    "payment_terms" "text",
    "exclusivity_terms" character varying,
    "multi_year" boolean,
    "annual_increase" real,
    "owner" character varying,
    "currency" character varying,
    "other_attributes" "jsonb",
    "products_fees" "jsonb",
    "user_id" "uuid",
    "updated_at" timestamp with time zone,
    "cancellation_process" "text",
    "distribution_rights" character varying,
    "execution_date" "date",
    "geo_restrictions" character varying,
    "marketing_rights" character varying,
    "permissions" "text",
    "scope_of_use" "text",
    "suspension_of_service" "text",
    "business_group" "text",
    "business_justification" "text",
    "business_sponsor" "text",
    "business_order" "text",
    "ai_extraction" "jsonb",
    "status_id" bigint,
    "type_id" bigint,
    "open_ai_file_id" character varying,
    "summary" "text",
    "related_contract_id" integer,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text"),
    "renewal_type" "text",
    "ai_validation" "jsonb",
    "locked_by" "uuid",
    "locked_by_email" "text",
    "tos_urls" "jsonb",
    "submitted_by" "text",
    "postsig_notes" "text",
    "data_disposal_tnc" "text",
    "discount" integer,
    "ext_validation" "jsonb",
    "status" "public"."contract_status" DEFAULT 'active'::"public"."contract_status" NOT NULL,
    "ai_extraction_status" "public"."ai_extraction_status",
    "activities" "text",
    "derivative_works" "text",
    "end_users" "text",
    "internal_external_users" "text",
    "market_data_types" "text",
    "audit_requirements" "text",
    "term_end_date" "jsonb",
    "term_start_date" "jsonb",
    "cancel_date" "jsonb",
    "trying_to_update_another_doc" boolean,
    "all_parties_signed" "text",
    "date_of_last_signature" "date",
    "required_signature_count" integer,
    "doc_fully_executed" boolean,
    "number_of_users" "text",
    "ai_notes" "text",
    "is_duplicate" boolean DEFAULT false NOT NULL,
    "will_not_renew" boolean DEFAULT false,
    "arbitration_and_conflict_resolution" "text",
    "cost_mitigation" "text",
    "security_awareness" "text",
    "service_level_agreements" "text",
    "vendor_location" "text",
    "ai_training_restrictions" "text",
    "will_not_renew_meta" "jsonb",
    "metadata" "jsonb",
    "legacy_renewal_period" "text",
    "renewal_period" integer,
    "subscription_term" double precision,
    "annual_increase_months" integer
);


ALTER TABLE "public"."contracts" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."contract_search"("public"."contracts") RETURNS "text"
    LANGUAGE "plpgsql"
    AS $_$DECLARE
  search_document text;
BEGIN
  SELECT
    coalesce($1.summary, '') || ' ' ||
    coalesce((
      SELECT string_agg(v.name, ' ')
      FROM vendors v
      WHERE v.id = $1.vendor_id
    ), '') || ' ' ||
    coalesce((
      SELECT string_agg(vp.name, ' ')
      FROM vendor_products_details vpd
      JOIN vendor_products vp ON vpd.product_id = vp.id
      WHERE vpd.contract_id = $1.id
    ), '') || ' ' ||
    coalesce((
      SELECT string_agg(ac.name, ' ')
      FROM contract_asset_classes cac
      JOIN asset_classes ac ON ac.id = cac.asset_class_id
      WHERE cac.contract_id = $1.id
    ), '') || ' ' ||
    coalesce((
      SELECT string_agg(ut.name, ' ')
      FROM contract_tags ct
      JOIN user_tags ut ON ut.id = ct.tag_id
      WHERE ct.contract_id = $1.id
    ), '') || ' ' ||
    coalesce((
      SELECT ct.name
      FROM contract_types ct
      WHERE ct.id = $1.type_id
    ), '')
  INTO search_document;
  RETURN search_document;
END;$_$;


ALTER FUNCTION "public"."contract_search"("public"."contracts") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_user_and_roles"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Insert into public.users
  INSERT INTO public.users (id, name, email, job_title, organization, department)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'job_title',
    NEW.raw_user_meta_data ->> 'organization',
    NEW.raw_user_meta_data ->> 'department'
  );

  -- Check email domain and assign appropriate role
  IF NEW.email LIKE '%@postsig.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (
      NEW.id,
      'admin'
    );
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (
      NEW.id,
      'user'
    );
  END IF;

  -- Update auth.users to set show_ftux to true
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'::jsonb),
    '{show_ftux}',
    'true'::jsonb,
    true
  )
  WHERE id = NEW.id;

  -- Update auth.users to set accepted_terms to false
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'::jsonb),
    '{accepted_terms}',
    'false'::jsonb,
    true
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."create_user_and_roles"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."custom_access_token_hook"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    AS $$
  declare
    claims jsonb;
    user_role public.app_role;
  begin
    -- Check if the user is marked as admin in the profiles table
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_role is not null then
      -- Set the claim
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    else
      claims := jsonb_set(claims, '{user_role}', 'null');
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;
$$;


ALTER FUNCTION "public"."custom_access_token_hook"("event" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."delete_user_sessions"("user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'auth', 'public'
    AS $_$
BEGIN
  DELETE FROM auth.sessions WHERE auth.sessions.user_id = $1::uuid;
END;
$_$;


ALTER FUNCTION "public"."delete_user_sessions"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fetch_vendor_data"("vendor_id" integer) RETURNS "text"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."fetch_vendor_data"("vendor_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_all_vendor_descriptions"() RETURNS TABLE("vendor_id" integer, "status" "text")
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."initialize_all_vendor_descriptions"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."initialize_contract_dates"() RETURNS SETOF "public"."contracts"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_contract record;
  v_period_start date;
  v_period_end date;
  v_original_end date;
  v_interval interval;
BEGIN
  -- Process each expired active contract
  FOR v_contract IN
    SELECT *
    FROM contracts
    WHERE (term_end_date->0->>'date')::date < CURRENT_DATE
    AND status = 'active'
  LOOP
    -- Get the original end date
    v_original_end := (v_contract.term_end_date->0->>'date')::date;

    IF v_contract.subscription_term ILIKE 'annual%' THEN
      -- Start from the original end date and keep advancing until we find the current period
      v_period_start := v_original_end + interval '1 day';
      v_period_end := v_period_start + interval '1 year' - interval '1 day';

      -- Keep advancing the period until we find one that includes current date
      WHILE v_period_end < CURRENT_DATE LOOP
        v_period_start := v_period_end + interval '1 day';
        v_period_end := v_period_start + interval '1 year' - interval '1 day';
      END LOOP;
    ELSE
      -- For Monthly/Quarterly: set interval based on subscription term
      v_interval := CASE
        WHEN v_contract.subscription_term ILIKE 'quarterly%' THEN interval '3 months'
        WHEN v_contract.subscription_term ILIKE 'monthly%' THEN interval '1 month'
        ELSE interval '1 year'  -- default to annual for any other terms
      END;

      -- Start from the original end date
      v_period_start := v_original_end + interval '1 day';
      v_period_end := v_period_start + v_interval - interval '1 day';

      -- Keep advancing the period until we find one that includes current date
      WHILE v_period_end < CURRENT_DATE LOOP
        v_period_start := v_period_end + interval '1 day';
        v_period_end := v_period_start + v_interval - interval '1 day';
      END LOOP;
    END IF;

    -- Update the contract with the calculated dates
    UPDATE contracts
    SET
      term_start_date = jsonb_build_array(
        jsonb_build_object(
          'date', v_period_start,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || term_start_date,
      term_end_date = jsonb_build_array(
        jsonb_build_object(
          'date', v_period_end,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || term_end_date,
      cancel_date = jsonb_build_array(
        jsonb_build_object(
          'date', (v_period_end - (v_contract.cancel_by_date || ' days')::interval)::date,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || cancel_date
    WHERE id = v_contract.id;
  END LOOP;

  -- Return all updated contracts
  RETURN QUERY
  SELECT * FROM contracts
  WHERE (term_end_date->0->>'date')::date < CURRENT_DATE
  AND status = 'active';
END;
$$;


ALTER FUNCTION "public"."initialize_contract_dates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision DEFAULT 0.7, "match_count" integer DEFAULT 5, "input_contract_id" integer DEFAULT NULL::integer) RETURNS TABLE("id" "text", "content" "text", "metadata" "jsonb", "similarity" double precision)
    LANGUAGE "plpgsql"
    AS $$BEGIN   
   RETURN QUERY   
   SELECT     
       documents.id,     
       documents.content,     
       documents.metadata,     
       1 - (documents.embedding <=> query_embedding) AS similarity   
   FROM documents   
   WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold 
   AND (documents.contract_id = input_contract_id OR input_contract_id IS NULL) 
   ORDER BY documents.embedding <=> query_embedding   
   LIMIT match_count; 
END;$$;


ALTER FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "input_contract_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."renew_expired_contracts"("p_contract_ids" integer[], "p_new_status" "public"."contract_status") RETURNS SETOF "public"."contracts"
    LANGUAGE "plpgsql"
    AS $_$DECLARE
  v_contract record;
  v_period_start date;
  v_period_end date;
  v_original_end date;
  v_interval interval;
  v_term text;
  v_months integer;
BEGIN
  -- Process each contract
  FOR v_contract IN
    SELECT *
    FROM contracts
    WHERE id = ANY(p_contract_ids)
  LOOP
    -- Get the original end date
    v_original_end := (v_contract.term_end_date->0->>'date')::date;

    -- Calculate the renewal interval based on renewal_period first, then fallback to subscription_term
    IF v_contract.renewal_period IS NOT NULL THEN
      -- Use renewal_period (months) directly
      v_months := v_contract.renewal_period;
    ELSE
      -- Try to interpret subscription_term
      v_term := v_contract.subscription_term;

      IF v_term IS NULL THEN
        -- Default to 12 months (1 year) when both renewal_period and subscription_term are NULL
        v_months := 12;
      ELSIF v_term ~ '^\d+$' THEN
        -- If subscription_term is just a number, interpret it as months
        v_months := v_term::integer;
      ELSIF v_term ILIKE 'annual%' THEN
        v_months := 12;
      ELSIF v_term ILIKE 'quarterly%' THEN
        v_months := 3;
      ELSIF v_term ILIKE 'monthly%' THEN
        v_months := 1;
      ELSE
        -- For any other case, default to 12 months (1 year)
        v_months := 12;
      END IF;
    END IF;

    -- Convert months to interval
    v_interval := (v_months || ' months')::interval;

    -- Start from the original end date and keep advancing until we find the current period
    v_period_start := v_original_end + interval '1 day';
    v_period_end := v_period_start + v_interval - interval '1 day';

    -- Keep advancing the period until we find one that includes current date
    WHILE v_period_end < CURRENT_DATE LOOP
      v_period_start := v_period_end + interval '1 day';
      v_period_end := v_period_start + v_interval - interval '1 day';
    END LOOP;

    -- Update the contract with the calculated dates
    UPDATE contracts
    SET
      status = p_new_status,
      term_start_date = jsonb_build_array(
        jsonb_build_object(
          'date', v_period_start,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || term_start_date,
      term_end_date = jsonb_build_array(
        jsonb_build_object(
          'date', v_period_end,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || term_end_date,
      cancel_date = jsonb_build_array(
        jsonb_build_object(
          'date', (v_period_end - (v_contract.cancel_by_date || ' days')::interval)::date,
          'updated_at', CURRENT_TIMESTAMP,
          'updated_by', v_contract.user_id
        )
      ) || cancel_date
    WHERE id = v_contract.id;
  END LOOP;

  -- Return all updated contracts
  RETURN QUERY
  SELECT * FROM contracts WHERE id = ANY(p_contract_ids);
END;$_$;


ALTER FUNCTION "public"."renew_expired_contracts"("p_contract_ids" integer[], "p_new_status" "public"."contract_status") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_daily_contract_updates"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  PERFORM check_expiring_contracts();
  PERFORM update_current_dates();
END;
$$;


ALTER FUNCTION "public"."run_daily_contract_updates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_vendor_description"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."trigger_update_vendor_description"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_auth_user_ftux"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  BEGIN
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{show_ftux}',
      to_jsonb(NEW.show_ftux),
      true
    )
    WHERE id = NEW.id;

    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_auth_user_ftux"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_auth_user_name"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  UPDATE auth.users 
  SET raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'),
    '{full_name}',
    to_jsonb(NEW.name),
    true
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_auth_user_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_auth_user_organization_id"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  BEGIN
    IF NEW.organization_id IS NOT NULL THEN
      UPDATE auth.users
      SET raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{organization_id}',
        to_jsonb(NEW.organization_id::text),
        true
      )
      WHERE id = NEW.id;
    END IF;

    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_auth_user_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_auth_user_terms"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
  BEGIN
    UPDATE auth.users
    SET raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{accepted_terms}',
      to_jsonb(NEW.accepted_terms),
      true
    )
    WHERE id = NEW.id;

    RETURN NEW;
  END;
  $$;


ALTER FUNCTION "public"."update_auth_user_terms"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_current_dates"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
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
$$;


ALTER FUNCTION "public"."update_current_dates"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_demo_contracts"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$BEGIN
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
END;$$;


ALTER FUNCTION "public"."update_demo_contracts"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" integer NOT NULL,
    "contract_id" integer,
    "user_id" "uuid",
    "activity_type" character varying(50),
    "activity_data" "jsonb",
    "created_at" timestamp without time zone DEFAULT "now"()
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."activities_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."activities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."activities_id_seq" OWNED BY "public"."activities"."id";



CREATE TABLE IF NOT EXISTS "public"."app_invites" (
    "id" bigint NOT NULL,
    "token" "text",
    "organization_id" "uuid",
    "user_id" "uuid",
    "expires_at" timestamp with time zone,
    "expired" boolean DEFAULT false NOT NULL,
    "invited_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text") NOT NULL
);


ALTER TABLE "public"."app_invites" OWNER TO "postgres";


ALTER TABLE "public"."app_invites" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."app_invites_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."asset_classes" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."asset_classes" OWNER TO "postgres";


ALTER TABLE "public"."asset_classes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."asset_classes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contract_asset_classes" (
    "contract_id" integer NOT NULL,
    "asset_class_id" integer NOT NULL,
    "sub_asset_class_id" integer,
    "id" integer NOT NULL,
    "is_parent_tag" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."contract_asset_classes" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contract_asset_class_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."contract_asset_class_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contract_asset_class_id_seq" OWNED BY "public"."contract_asset_classes"."id";



CREATE TABLE IF NOT EXISTS "public"."contract_citations" (
    "id" bigint NOT NULL,
    "contract_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "citation_text" "jsonb",
    "user_id" "uuid",
    "organization_id" "uuid"
);


ALTER TABLE "public"."contract_citations" OWNER TO "postgres";


ALTER TABLE "public"."contract_citations" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contract_citations_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contract_comments" (
    "id" bigint NOT NULL,
    "contract_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "parent_comment_id" bigint,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "is_deleted" boolean DEFAULT false NOT NULL,
    "content" "jsonb",
    CONSTRAINT "valid_content_structure" CHECK ((("jsonb_typeof"("content") = 'object'::"text") AND ("content" ? 'type'::"text") AND (("content" ->> 'type'::"text") = 'doc'::"text") AND ("content" ? 'content'::"text")))
);


ALTER TABLE "public"."contract_comments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_comments_attachments" (
    "id" integer NOT NULL,
    "file_path" "text" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_type" "text" NOT NULL,
    "file_size" integer NOT NULL,
    "comment_id" integer,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid",
    "contract_id" integer
);


ALTER TABLE "public"."contract_comments_attachments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contract_comments_attachments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."contract_comments_attachments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contract_comments_attachments_id_seq" OWNED BY "public"."contract_comments_attachments"."id";



ALTER TABLE "public"."contract_comments" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contract_comments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contract_docs" (
    "id" integer NOT NULL,
    "contract_id" integer,
    "type" character varying,
    "file_path" character varying,
    "description" "text",
    "updated_at" timestamp without time zone,
    "created_at" timestamp with time zone DEFAULT ("now"() AT TIME ZONE 'utc'::"text"),
    "user_id" "uuid",
    "docusign_envelope_id" "text",
    "docusign_sent_at" timestamp with time zone,
    "docusign_status" "text"
);


ALTER TABLE "public"."contract_docs" OWNER TO "postgres";


ALTER TABLE "public"."contract_docs" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contract_docs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE SEQUENCE IF NOT EXISTS "public"."contract_relationships_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."contract_relationships_id_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_relationships" (
    "id" integer DEFAULT "nextval"('"public"."contract_relationships_id_seq"'::"regclass") NOT NULL,
    "parent_contract_id" integer,
    "child_contract_id" integer,
    "created_at" timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    "vendor_id" integer,
    "metadata" "jsonb",
    "active" boolean,
    "disabled" boolean
);


ALTER TABLE "public"."contract_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contract_statuses" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "description" "text"
);


ALTER TABLE "public"."contract_statuses" OWNER TO "postgres";


ALTER TABLE "public"."contract_statuses" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contract_statuses_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contract_tags" (
    "id" integer NOT NULL,
    "contract_id" integer NOT NULL,
    "tag_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."contract_tags" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."contract_tags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."contract_tags_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."contract_tags_id_seq" OWNED BY "public"."contract_tags"."id";



CREATE TABLE IF NOT EXISTS "public"."contract_types" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying,
    "description" "text"
);


ALTER TABLE "public"."contract_types" OWNER TO "postgres";


ALTER TABLE "public"."contract_types" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contract_types_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."contract_users" (
    "id" bigint NOT NULL,
    "contract_id" integer,
    "name" "text" NOT NULL,
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "product_id" bigint
);


ALTER TABLE "public"."contract_users" OWNER TO "postgres";


ALTER TABLE "public"."contract_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contract_users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE "public"."contracts" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."contracts_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."corporate_actions" (
    "id" integer NOT NULL,
    "action_type" "public"."CorporateActionType" NOT NULL,
    "effective_date" timestamp with time zone NOT NULL,
    "description" "text",
    "primary_vendor_id" integer NOT NULL,
    "secondary_vendor_id" integer,
    "notes" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "created_by" "text"
);


ALTER TABLE "public"."corporate_actions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."corporate_actions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."corporate_actions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."corporate_actions_id_seq" OWNED BY "public"."corporate_actions"."id";



CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "email" "text",
    "phone" integer,
    "domain" "text",
    "description" "text",
    "status" "public"."VendorStatus",
    "merged_into_vendor_id" integer,
    "merger_effective_date" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


COMMENT ON TABLE "public"."vendors" IS 'Intermediate consolidated global vendors table.';



CREATE OR REPLACE VIEW "public"."current_vendors" AS
 WITH RECURSIVE "vendor_lineage" AS (
         SELECT "vendors"."id" AS "original_vendor_id",
            "vendors"."id" AS "current_vendor_id",
            "vendors"."name" AS "current_vendor_name"
           FROM "public"."vendors"
          WHERE ("vendors"."status" = 'active'::"public"."VendorStatus")
        UNION ALL
         SELECT "v"."id" AS "original_vendor_id",
            "vl"."current_vendor_id",
            "vl"."current_vendor_name"
           FROM ("public"."vendors" "v"
             JOIN "vendor_lineage" "vl" ON (("v"."merged_into_vendor_id" = "vl"."original_vendor_id")))
          WHERE ("v"."status" = ANY (ARRAY['merged'::"public"."VendorStatus", 'acquired'::"public"."VendorStatus"]))
        )
 SELECT DISTINCT "vendor_lineage"."original_vendor_id",
    "vendor_lineage"."current_vendor_id",
    "vendor_lineage"."current_vendor_name"
   FROM "vendor_lineage";


ALTER TABLE "public"."current_vendors" OWNER TO "postgres";


COMMENT ON VIEW "public"."current_vendors" IS 'Recreates the vendor lineage logic. For each vendor, it traces through corporate_actions (mergers, acquisitions) to find the ultimate current vendor ID and name.';



CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "text" NOT NULL,
    "content" "text",
    "metadata" "jsonb",
    "embedding" "public"."vector"(1536),
    "user_id" "uuid",
    "organization_id" "uuid",
    "contract_id" integer
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_products" (
    "id" integer NOT NULL,
    "vendor_id" integer NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendor_products" OWNER TO "postgres";


COMMENT ON TABLE "public"."vendor_products" IS 'Intermediate consolidated global vendor products table.';



CREATE SEQUENCE IF NOT EXISTS "public"."global_vendor_products_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."global_vendor_products_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."global_vendor_products_id_seq" OWNED BY "public"."vendor_products"."id";



CREATE SEQUENCE IF NOT EXISTS "public"."global_vendors_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."global_vendors_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."global_vendors_id_seq" OWNED BY "public"."vendors"."id";



CREATE TABLE IF NOT EXISTS "public"."organization_vendor_settings" (
    "organization_id" "uuid" NOT NULL,
    "vendor_id" integer NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."organization_vendor_settings" OWNER TO "postgres";


COMMENT ON TABLE "public"."organization_vendor_settings" IS 'Stores organization-specific settings/metadata for global vendors, as a JSONB object.';



CREATE TABLE IF NOT EXISTS "public"."organizations" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "fiscal_year_start_month" smallint DEFAULT '1'::smallint NOT NULL,
    "app_access" boolean DEFAULT true,
    "upload_app_access" boolean DEFAULT true,
    "trial" boolean DEFAULT false,
    "missing_clauses_settings" "jsonb",
    "missing_clauses_confirmed" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "id" bigint NOT NULL,
    "role" "public"."app_role" NOT NULL,
    "permission" "public"."app_permission"
);


ALTER TABLE "public"."role_permissions" OWNER TO "postgres";


ALTER TABLE "public"."role_permissions" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."role_permissions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "description" "text"
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sub_asset_classes" (
    "id" bigint NOT NULL,
    "parent_id" bigint NOT NULL,
    "name" "text" NOT NULL
);


ALTER TABLE "public"."sub_asset_classes" OWNER TO "postgres";


ALTER TABLE "public"."sub_asset_classes" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."sub_asset_classes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles2" (
    "user_id" "uuid" NOT NULL,
    "role_id" integer NOT NULL,
    "id" integer NOT NULL
);


ALTER TABLE "public"."user_roles2" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_roles2_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."user_roles2_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_roles2_id_seq" OWNED BY "public"."user_roles2"."id";



ALTER TABLE "public"."user_roles" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."user_roles_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."user_tags" (
    "id" integer NOT NULL,
    "name" "text" NOT NULL,
    "org_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."user_tags" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."user_tags_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."user_tags_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."user_tags_id_seq" OWNED BY "public"."user_tags"."id";



CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "updated_at" timestamp with time zone,
    "email" "text",
    "name" "text",
    "job_title" "text",
    "organization" "text",
    "department" "text",
    "accepted_terms" boolean DEFAULT false,
    "show_ftux" boolean DEFAULT true NOT NULL,
    "organization_id" "uuid",
    "signed_up" boolean DEFAULT false,
    "advance_notice_period" integer DEFAULT 90,
    "email_frequency" "text" DEFAULT 'Weekly'::"text",
    "email_alerts" boolean DEFAULT false,
    "last_notified_date" "date",
    "docusign_access_token" "text",
    "docusign_account_id" "text",
    "docusign_connected" boolean DEFAULT false,
    "docusign_refresh_token" "text",
    "docusign_base_uri" "text"
);


ALTER TABLE "public"."users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_processing_log" (
    "vendor_id" integer NOT NULL,
    "processed_at" timestamp without time zone,
    "status" "text"
);


ALTER TABLE "public"."vendor_processing_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_products_details" (
    "id" bigint NOT NULL,
    "product_id" bigint NOT NULL,
    "contract_id" integer NOT NULL,
    "year" integer NOT NULL,
    "fees" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "user_id" "uuid",
    "n_users" integer
);


ALTER TABLE "public"."vendor_products_details" OWNER TO "postgres";


ALTER TABLE "public"."vendor_products_details" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."vendor_products_details_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."vendor_products_original_backup_20250606" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vendor_id" integer NOT NULL,
    "user_id" "uuid"
);


ALTER TABLE "public"."vendor_products_original_backup_20250606" OWNER TO "postgres";


ALTER TABLE "public"."vendor_products_original_backup_20250606" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."vendor_products_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."vendor_products_users" (
    "id" bigint NOT NULL,
    "product_id" bigint,
    "contract_id" integer,
    "number_of_users" bigint,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."vendor_products_users" OWNER TO "postgres";


ALTER TABLE "public"."vendor_products_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."vendor_products_users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."vendors_original_backup_20250606" (
    "id" integer NOT NULL,
    "name" character varying,
    "address" "text",
    "email" character varying,
    "phone" integer,
    "created_at" timestamp without time zone,
    "user_id" "uuid",
    "domain" "text",
    "description" "text",
    "ict_provider" boolean,
    "merged_into_vendor_id" integer,
    "merger_effective_date" timestamp with time zone,
    "status" "public"."VendorStatus"
);


ALTER TABLE "public"."vendors_original_backup_20250606" OWNER TO "postgres";


ALTER TABLE "public"."vendors_original_backup_20250606" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."vendors_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."activities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."activities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contract_asset_classes" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contract_asset_class_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contract_comments_attachments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contract_comments_attachments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."contract_tags" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."contract_tags_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."corporate_actions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."corporate_actions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_roles2" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_roles2_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."user_tags" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_tags_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vendor_products" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."global_vendor_products_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."vendors" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."global_vendors_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_invites"
    ADD CONSTRAINT "app_invites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_invites"
    ADD CONSTRAINT "app_invites_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."asset_classes"
    ADD CONSTRAINT "asset_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_asset_classes"
    ADD CONSTRAINT "contract_asset_class_contract_id_asset_class_id_sub_as_key" UNIQUE ("contract_id", "asset_class_id", "sub_asset_class_id");



ALTER TABLE ONLY "public"."contract_asset_classes"
    ADD CONSTRAINT "contract_asset_class_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_relationships"
    ADD CONSTRAINT "contract_associations_parent_contract_id_child_contract_id_key" UNIQUE ("parent_contract_id", "child_contract_id");



ALTER TABLE ONLY "public"."contract_relationships"
    ADD CONSTRAINT "contract_associations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_citations"
    ADD CONSTRAINT "contract_citations_contract_id_key" UNIQUE ("contract_id");



ALTER TABLE ONLY "public"."contract_citations"
    ADD CONSTRAINT "contract_citations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_comments_attachments"
    ADD CONSTRAINT "contract_comments_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_comments"
    ADD CONSTRAINT "contract_comments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_docs"
    ADD CONSTRAINT "contract_docs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_statuses"
    ADD CONSTRAINT "contract_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_tags"
    ADD CONSTRAINT "contract_tags_contract_id_tag_id_key" UNIQUE ("contract_id", "tag_id");



ALTER TABLE ONLY "public"."contract_tags"
    ADD CONSTRAINT "contract_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_types"
    ADD CONSTRAINT "contract_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contract_users"
    ADD CONSTRAINT "contract_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."corporate_actions"
    ADD CONSTRAINT "corporate_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organization_name_unique" UNIQUE ("name");



ALTER TABLE ONLY "public"."organization_vendor_settings"
    ADD CONSTRAINT "organization_vendor_settings_pkey" PRIMARY KEY ("organization_id", "vendor_id");



ALTER TABLE ONLY "public"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permissions"
    ADD CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sub_asset_classes"
    ADD CONSTRAINT "sub_asset_classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_products_original_backup_20250606"
    ADD CONSTRAINT "unique_id" UNIQUE ("id");



ALTER TABLE ONLY "public"."vendors_original_backup_20250606"
    ADD CONSTRAINT "unique_name_and_user_id" UNIQUE ("name", "user_id");



ALTER TABLE ONLY "public"."corporate_actions"
    ADD CONSTRAINT "unique_primary_secondary_vendors" UNIQUE ("primary_vendor_id", "secondary_vendor_id");



ALTER TABLE ONLY "public"."user_roles2"
    ADD CONSTRAINT "user_roles2_id_key" UNIQUE ("id");



ALTER TABLE ONLY "public"."user_roles2"
    ADD CONSTRAINT "user_roles2_pkey" PRIMARY KEY ("user_id", "role_id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_role_key" UNIQUE ("user_id", "role");



ALTER TABLE ONLY "public"."user_tags"
    ADD CONSTRAINT "user_tags_name_org_id_key" UNIQUE ("name", "org_id");



ALTER TABLE ONLY "public"."user_tags"
    ADD CONSTRAINT "user_tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_processing_log"
    ADD CONSTRAINT "vendor_processing_log_pkey" PRIMARY KEY ("vendor_id");



ALTER TABLE ONLY "public"."vendor_products_original_backup_20250606"
    ADD CONSTRAINT "vendor_products_original_backup_20250606_pkey" PRIMARY KEY ("name", "vendor_id");



ALTER TABLE ONLY "public"."vendor_products"
    ADD CONSTRAINT "vendor_products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_products_users"
    ADD CONSTRAINT "vendor_products_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_products_users"
    ADD CONSTRAINT "vendor_products_users_product_id_contract_id_key" UNIQUE ("product_id", "contract_id");



ALTER TABLE ONLY "public"."vendor_products"
    ADD CONSTRAINT "vendor_products_vendor_id_name_key" UNIQUE ("vendor_id", "name");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."vendors_original_backup_20250606"
    ADD CONSTRAINT "vendors_original_backup_20250606_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "contract_users_email_product_unique_idx" ON "public"."contract_users" USING "btree" ("contract_id", "email", COALESCE("product_id", (0)::bigint));



CREATE INDEX "contracts_id_idx" ON "public"."contracts" USING "btree" ("id");



CREATE INDEX "contracts_status_idx" ON "public"."contracts" USING "btree" ("status");



CREATE INDEX "documents_contract_id_idx" ON "public"."documents" USING "btree" ("contract_id");



CREATE INDEX "idx_contract_comments_attachments_comment_id" ON "public"."contract_comments_attachments" USING "btree" ("comment_id");



CREATE INDEX "idx_contract_comments_attachments_user_id" ON "public"."contract_comments_attachments" USING "btree" ("user_id");



CREATE INDEX "idx_contract_comments_contract_id" ON "public"."contract_comments" USING "btree" ("contract_id");



CREATE INDEX "idx_contract_comments_created_at" ON "public"."contract_comments" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_contract_comments_parent_id" ON "public"."contract_comments" USING "btree" ("parent_comment_id") WHERE ("parent_comment_id" IS NOT NULL);



CREATE INDEX "idx_contract_comments_user_id" ON "public"."contract_comments" USING "btree" ("user_id");



CREATE INDEX "idx_contract_tags_contract_id" ON "public"."contract_tags" USING "btree" ("contract_id");



CREATE INDEX "idx_contract_tags_tag_id" ON "public"."contract_tags" USING "btree" ("tag_id");



CREATE INDEX "idx_contracts_status_statusid_userid" ON "public"."contracts" USING "btree" ("status", "status_id", "user_id");



CREATE INDEX "idx_contracts_vendorid_status" ON "public"."contracts" USING "btree" ("vendor_id", "status");



CREATE INDEX "idx_global_vendors_merged_into" ON "public"."vendors" USING "btree" ("merged_into_vendor_id");



CREATE INDEX "idx_user_tags_org_id" ON "public"."user_tags" USING "btree" ("org_id");



CREATE UNIQUE INDEX "unique_contract_null_product" ON "public"."vendor_products_users" USING "btree" ("contract_id") WHERE ("product_id" IS NULL);



CREATE UNIQUE INDEX "unique_primary_secondary_vendors_index" ON "public"."corporate_actions" USING "btree" (LEAST("primary_vendor_id", "secondary_vendor_id"), GREATEST("primary_vendor_id", "secondary_vendor_id"));



CREATE INDEX "vendors_merged_into_vendor_id_idx" ON "public"."vendors_original_backup_20250606" USING "btree" ("merged_into_vendor_id");



CREATE OR REPLACE TRIGGER "update_auth_user_ftux" AFTER UPDATE OF "show_ftux" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_auth_user_ftux"();



CREATE OR REPLACE TRIGGER "update_auth_user_name" AFTER UPDATE OF "name" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_auth_user_name"();



CREATE OR REPLACE TRIGGER "update_auth_user_organization_id" AFTER UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_auth_user_organization_id"();



CREATE OR REPLACE TRIGGER "update_auth_user_terms" AFTER UPDATE OF "accepted_terms" ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."update_auth_user_terms"();



CREATE OR REPLACE TRIGGER "update_vendor_description" AFTER INSERT OR UPDATE OF "domain" ON "public"."vendors_original_backup_20250606" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_vendor_description"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."app_invites"
    ADD CONSTRAINT "app_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."app_invites"
    ADD CONSTRAINT "app_invites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."contract_asset_classes"
    ADD CONSTRAINT "contract_asset_class_asset_class_id_fkey" FOREIGN KEY ("asset_class_id") REFERENCES "public"."asset_classes"("id");



ALTER TABLE ONLY "public"."contract_asset_classes"
    ADD CONSTRAINT "contract_asset_class_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id");



ALTER TABLE ONLY "public"."contract_asset_classes"
    ADD CONSTRAINT "contract_asset_class_sub_asset_class_id_fkey" FOREIGN KEY ("sub_asset_class_id") REFERENCES "public"."sub_asset_classes"("id");



ALTER TABLE ONLY "public"."contract_citations"
    ADD CONSTRAINT "contract_citations_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_citations"
    ADD CONSTRAINT "contract_citations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."contract_citations"
    ADD CONSTRAINT "contract_citations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."contract_comments_attachments"
    ADD CONSTRAINT "contract_comments_attachments_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "public"."contract_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_comments_attachments"
    ADD CONSTRAINT "contract_comments_attachments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_comments_attachments"
    ADD CONSTRAINT "contract_comments_attachments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_comments_attachments"
    ADD CONSTRAINT "contract_comments_attachments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."contract_comments"
    ADD CONSTRAINT "contract_comments_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_comments"
    ADD CONSTRAINT "contract_comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."contract_comments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_comments"
    ADD CONSTRAINT "contract_comments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."contract_docs"
    ADD CONSTRAINT "contract_docs_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_docs"
    ADD CONSTRAINT "contract_docs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."contract_relationships"
    ADD CONSTRAINT "contract_relationships_child_contract_id_fkey" FOREIGN KEY ("child_contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_relationships"
    ADD CONSTRAINT "contract_relationships_child_contract_id_fkey1" FOREIGN KEY ("child_contract_id") REFERENCES "public"."contracts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_relationships"
    ADD CONSTRAINT "contract_relationships_parent_contract_id_fkey" FOREIGN KEY ("parent_contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_relationships"
    ADD CONSTRAINT "contract_relationships_parent_contract_id_fkey1" FOREIGN KEY ("parent_contract_id") REFERENCES "public"."contracts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_relationships"
    ADD CONSTRAINT "contract_relationships_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."contract_tags"
    ADD CONSTRAINT "contract_tags_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_tags"
    ADD CONSTRAINT "contract_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."user_tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_users"
    ADD CONSTRAINT "contract_users_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contract_users"
    ADD CONSTRAINT "contract_users_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."vendor_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "public"."contract_statuses"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "public"."contract_types"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."contracts"
    ADD CONSTRAINT "contracts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."corporate_actions"
    ADD CONSTRAINT "corporate_actions_primary_vendor_id_fkey" FOREIGN KEY ("primary_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."corporate_actions"
    ADD CONSTRAINT "corporate_actions_secondary_vendor_id_fkey" FOREIGN KEY ("secondary_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."organization_vendor_settings"
    ADD CONSTRAINT "organization_vendor_settings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organization_vendor_settings"
    ADD CONSTRAINT "organization_vendor_settings_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sub_asset_classes"
    ADD CONSTRAINT "sub_asset_classes_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."asset_classes"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles2"
    ADD CONSTRAINT "user_roles2_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles2"
    ADD CONSTRAINT "user_roles2_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_tags"
    ADD CONSTRAINT "user_tags_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");



ALTER TABLE ONLY "public"."vendor_products_details"
    ADD CONSTRAINT "vendor_products_details_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_products_details"
    ADD CONSTRAINT "vendor_products_details_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."vendor_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_products_details"
    ADD CONSTRAINT "vendor_products_details_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_products_original_backup_20250606"
    ADD CONSTRAINT "vendor_products_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_products_users"
    ADD CONSTRAINT "vendor_products_users_contract_id_fkey" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_products_users"
    ADD CONSTRAINT "vendor_products_users_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."vendor_products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_products"
    ADD CONSTRAINT "vendor_products_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_merged_into_vendor_id_fkey" FOREIGN KEY ("merged_into_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendors_original_backup_20250606"
    ADD CONSTRAINT "vendors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") NOT VALID;



CREATE POLICY "All access to extractors" ON "public"."vendor_products_details" USING (((("auth"."jwt"() ->> 'email'::"text") = 'ext_1@postsig.com'::"text") OR (("auth"."jwt"() ->> 'email'::"text") = 'extraction@postsig.com'::"text")));



CREATE POLICY "All access to extractors" ON "public"."vendor_products_original_backup_20250606" USING (((("auth"."jwt"() ->> 'email'::"text") = 'ext_1@postsig.com'::"text") OR (("auth"."jwt"() ->> 'email'::"text") = 'extraction@postsig.com'::"text")));



CREATE POLICY "Allow auth admin to read user roles" ON "public"."user_roles" FOR SELECT TO "supabase_auth_admin" USING (true);



CREATE POLICY "Allow individual read access" ON "public"."user_roles" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Authenticated users can view global_vendor_products" ON "public"."vendor_products" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view global_vendors" ON "public"."vendors" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Authenticated users can view org vendor settings" ON "public"."organization_vendor_settings" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Delete own comments" ON "public"."contract_comments" FOR DELETE TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Enable insert for authenticated users only" ON "public"."activities" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."contract_comments" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."contract_tags" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable insert for authenticated users only" ON "public"."user_tags" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "Enable read access for all users" ON "public"."app_invites" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."asset_classes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."contract_asset_classes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."contract_comments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."contract_tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."sub_asset_classes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."user_tags" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable select for authenticated users only" ON "public"."corporate_actions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable select for authenticated users only" ON "public"."organizations" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Enable update for authenticated users only" ON "public"."organizations" FOR UPDATE TO "authenticated" USING (true) WITH CHECK (true);



CREATE POLICY "Public users are viewable by everyone." ON "public"."users" FOR SELECT USING (true);



CREATE POLICY "Select for authenticated" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Select for authenticated users" ON "public"."contract_statuses" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Select for authenticated users" ON "public"."contract_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Update own comments" ON "public"."contract_comments" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "User can see their own rows" ON "public"."contract_docs" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "User can see their own rows" ON "public"."contracts" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "User can see their own rows" ON "public"."user_roles2" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "User can see their own rows" ON "public"."vendor_products_details" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "User can see their own rows" ON "public"."vendor_products_original_backup_20250606" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "User can see their own rows" ON "public"."vendors_original_backup_20250606" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create a row" ON "public"."contract_docs" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create a row" ON "public"."contracts" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create a row" ON "public"."user_roles2" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create a row" ON "public"."vendor_products_details" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create a row" ON "public"."vendor_products_original_backup_20250606" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can create a row" ON "public"."vendors_original_backup_20250606" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can insert their own attachments" ON "public"."contract_comments_attachments" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own profile." ON "public"."users" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update contracts in their org" ON "public"."contracts" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "contracts"."user_id") AND ("users"."organization_id" = ( SELECT "users_1"."organization_id"
           FROM "public"."users" "users_1"
          WHERE ("users_1"."id" = "auth"."uid"())))))));



CREATE POLICY "Users can update own profile." ON "public"."users" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update their own rows" ON "public"."contract_docs" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own rows" ON "public"."contracts" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own rows" ON "public"."user_roles2" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own rows" ON "public"."vendor_products_details" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own rows" ON "public"."vendor_products_original_backup_20250606" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can update their own rows" ON "public"."vendors_original_backup_20250606" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "Users can view their own activity" ON "public"."activities" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."app_invites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."asset_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_asset_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_citations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_comments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_docs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contract_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contracts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."corporate_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organization_vendor_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."sub_asset_classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles2" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_products_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_products_original_backup_20250606" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_products_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendors_original_backup_20250606" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";





GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_in"("cstring", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_out"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_recv"("internal", "oid", integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_send"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_typmod_in"("cstring"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(real[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(double precision[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(integer[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."array_to_vector"(numeric[], integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_to_float4"("public"."vector", integer, boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector"("public"."vector", integer, boolean) TO "service_role";

























































































































































































































































GRANT ALL ON FUNCTION "public"."admin_fetch_user_auth_data"() TO "anon";
GRANT ALL ON FUNCTION "public"."admin_fetch_user_auth_data"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_fetch_user_auth_data"() TO "service_role";



GRANT ALL ON FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") TO "anon";
GRANT ALL ON FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") TO "authenticated";
GRANT ALL ON FUNCTION "public"."authorize"("requested_permission" "public"."app_permission") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_expired_contracts"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_expired_contracts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_expired_contracts"() TO "service_role";



GRANT ALL ON TABLE "public"."contracts" TO "anon";
GRANT ALL ON TABLE "public"."contracts" TO "authenticated";
GRANT ALL ON TABLE "public"."contracts" TO "service_role";



GRANT ALL ON FUNCTION "public"."contract_search"("public"."contracts") TO "anon";
GRANT ALL ON FUNCTION "public"."contract_search"("public"."contracts") TO "authenticated";
GRANT ALL ON FUNCTION "public"."contract_search"("public"."contracts") TO "service_role";



GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cosine_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_user_and_roles"() TO "anon";
GRANT ALL ON FUNCTION "public"."create_user_and_roles"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_user_and_roles"() TO "service_role";



GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."custom_access_token_hook"("event" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."delete_user_sessions"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."delete_user_sessions"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."delete_user_sessions"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fetch_vendor_data"("vendor_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fetch_vendor_data"("vendor_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fetch_vendor_data"("vendor_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hnswhandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_all_vendor_descriptions"() TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_all_vendor_descriptions"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_all_vendor_descriptions"() TO "service_role";



GRANT ALL ON FUNCTION "public"."initialize_contract_dates"() TO "anon";
GRANT ALL ON FUNCTION "public"."initialize_contract_dates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."initialize_contract_dates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ivfflathandler"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l1_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."l2_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "input_contract_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "input_contract_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_documents"("query_embedding" "public"."vector", "match_threshold" double precision, "match_count" integer, "input_contract_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."renew_expired_contracts"("p_contract_ids" integer[], "p_new_status" "public"."contract_status") TO "anon";
GRANT ALL ON FUNCTION "public"."renew_expired_contracts"("p_contract_ids" integer[], "p_new_status" "public"."contract_status") TO "authenticated";
GRANT ALL ON FUNCTION "public"."renew_expired_contracts"("p_contract_ids" integer[], "p_new_status" "public"."contract_status") TO "service_role";



GRANT ALL ON FUNCTION "public"."run_daily_contract_updates"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_daily_contract_updates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_daily_contract_updates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_vendor_description"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_vendor_description"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_vendor_description"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_auth_user_ftux"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_auth_user_ftux"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_auth_user_ftux"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_auth_user_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_auth_user_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_auth_user_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_auth_user_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_auth_user_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_auth_user_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_auth_user_terms"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_auth_user_terms"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_auth_user_terms"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_current_dates"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_current_dates"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_current_dates"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_demo_contracts"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_demo_contracts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_demo_contracts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_accum"(double precision[], "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_add"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_avg"(double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_cmp"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "anon";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_combine"(double precision[], double precision[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_dims"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_eq"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ge"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_gt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_l2_squared_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_le"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_lt"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_mul"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_ne"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_negative_inner_product"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_norm"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_spherical_distance"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."vector_sub"("public"."vector", "public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."avg"("public"."vector") TO "service_role";



GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "postgres";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "anon";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "authenticated";
GRANT ALL ON FUNCTION "public"."sum"("public"."vector") TO "service_role";





















GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."activities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."activities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."activities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."app_invites" TO "anon";
GRANT ALL ON TABLE "public"."app_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."app_invites" TO "service_role";



GRANT ALL ON SEQUENCE "public"."app_invites_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."app_invites_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."app_invites_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."asset_classes" TO "anon";
GRANT ALL ON TABLE "public"."asset_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."asset_classes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."asset_classes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."asset_classes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."asset_classes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_asset_classes" TO "anon";
GRANT ALL ON TABLE "public"."contract_asset_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_asset_classes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_asset_class_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_asset_class_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_asset_class_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_citations" TO "anon";
GRANT ALL ON TABLE "public"."contract_citations" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_citations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_citations_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_citations_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_citations_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_comments" TO "anon";
GRANT ALL ON TABLE "public"."contract_comments" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_comments" TO "service_role";



GRANT ALL ON TABLE "public"."contract_comments_attachments" TO "anon";
GRANT ALL ON TABLE "public"."contract_comments_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_comments_attachments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_comments_attachments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_comments_attachments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_comments_attachments_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_comments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_comments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_comments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_docs" TO "anon";
GRANT ALL ON TABLE "public"."contract_docs" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_docs" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_docs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_docs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_docs_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_relationships_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_relationships_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_relationships_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_relationships" TO "anon";
GRANT ALL ON TABLE "public"."contract_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."contract_statuses" TO "anon";
GRANT ALL ON TABLE "public"."contract_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_statuses" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_statuses_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_statuses_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_statuses_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_tags" TO "anon";
GRANT ALL ON TABLE "public"."contract_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_tags" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_tags_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_tags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_tags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_types" TO "anon";
GRANT ALL ON TABLE "public"."contract_types" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."contract_users" TO "anon";
GRANT ALL ON TABLE "public"."contract_users" TO "authenticated";
GRANT ALL ON TABLE "public"."contract_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contract_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contract_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contract_users_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."contracts_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."contracts_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."contracts_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."corporate_actions" TO "anon";
GRANT ALL ON TABLE "public"."corporate_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."corporate_actions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."corporate_actions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."corporate_actions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."corporate_actions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



GRANT ALL ON TABLE "public"."current_vendors" TO "anon";
GRANT ALL ON TABLE "public"."current_vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."current_vendors" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_products" TO "anon";
GRANT ALL ON TABLE "public"."vendor_products" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_products" TO "service_role";



GRANT ALL ON SEQUENCE "public"."global_vendor_products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."global_vendor_products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."global_vendor_products_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."global_vendors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."global_vendors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."global_vendors_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."organization_vendor_settings" TO "anon";
GRANT ALL ON TABLE "public"."organization_vendor_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."organization_vendor_settings" TO "service_role";



GRANT ALL ON TABLE "public"."organizations" TO "anon";
GRANT ALL ON TABLE "public"."organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."organizations" TO "service_role";



GRANT ALL ON TABLE "public"."role_permissions" TO "anon";
GRANT ALL ON TABLE "public"."role_permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permissions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."role_permissions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."role_permissions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."role_permissions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON TABLE "public"."sub_asset_classes" TO "anon";
GRANT ALL ON TABLE "public"."sub_asset_classes" TO "authenticated";
GRANT ALL ON TABLE "public"."sub_asset_classes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."sub_asset_classes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."sub_asset_classes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."sub_asset_classes_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "service_role";
GRANT ALL ON TABLE "public"."user_roles" TO "supabase_auth_admin";



GRANT ALL ON TABLE "public"."user_roles2" TO "anon";
GRANT ALL ON TABLE "public"."user_roles2" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles2" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_roles2_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_roles2_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_roles2_id_seq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_roles_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."user_tags" TO "anon";
GRANT ALL ON TABLE "public"."user_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."user_tags" TO "service_role";



GRANT ALL ON SEQUENCE "public"."user_tags_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."user_tags_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."user_tags_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_processing_log" TO "anon";
GRANT ALL ON TABLE "public"."vendor_processing_log" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_processing_log" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_products_details" TO "anon";
GRANT ALL ON TABLE "public"."vendor_products_details" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_products_details" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendor_products_details_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendor_products_details_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendor_products_details_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_products_original_backup_20250606" TO "anon";
GRANT ALL ON TABLE "public"."vendor_products_original_backup_20250606" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_products_original_backup_20250606" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendor_products_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendor_products_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendor_products_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_products_users" TO "anon";
GRANT ALL ON TABLE "public"."vendor_products_users" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_products_users" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendor_products_users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendor_products_users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendor_products_users_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vendors_original_backup_20250606" TO "anon";
GRANT ALL ON TABLE "public"."vendors_original_backup_20250606" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors_original_backup_20250606" TO "service_role";



GRANT ALL ON SEQUENCE "public"."vendors_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vendors_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vendors_id_seq" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
