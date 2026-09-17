alter table "public"."master_field_definitions" add column "required" boolean not null default false;

set check_function_bodies = off;

DROP FUNCTION IF EXISTS public.merge_security_metadata(bigint, uuid, jsonb);
DROP FUNCTION IF EXISTS public.merge_security_terms_raw_terms(bigint, uuid, date, jsonb);

-- Atomic JSONB metadata merge for inv_security
-- Prevents concurrent read-merge-write from clobbering data
CREATE OR REPLACE FUNCTION merge_security_metadata(
  p_security_id bigint,
  p_org_id uuid,
  p_new_metadata jsonb
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE inv_security
  SET metadata = COALESCE(metadata, '{}'::jsonb) || p_new_metadata,
  updated_at = NOW()
  WHERE id = p_security_id
    AND organization_id = p_org_id;
$$;

-- Atomic JSONB metadata merge for the latest active inv_security_terms row
CREATE OR REPLACE FUNCTION merge_security_terms_raw_terms(
  p_security_id bigint,
  p_org_id uuid,
  p_effective_date date,
  p_new_raw_terms jsonb
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE inv_security_terms
  SET raw_terms = COALESCE(raw_terms, '{}'::jsonb) || p_new_raw_terms,
  updated_at = NOW()
  WHERE security_id = p_security_id
    AND organization_id = p_org_id
    AND effective_date = p_effective_date
    AND superseded_date IS NULL;
$$;


