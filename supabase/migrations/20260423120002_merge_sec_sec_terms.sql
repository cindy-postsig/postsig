-- Atomic JSONB metadata merge for inv_security
-- Prevents concurrent read-merge-write from clobbering data
CREATE OR REPLACE FUNCTION merge_security_metadata(
  p_security_id bigint,
  p_new_metadata jsonb
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE inv_security
  SET metadata = COALESCE(metadata, '{}'::jsonb) || p_new_metadata,
  updated_at = NOW()
  WHERE id = p_security_id;
$$;

-- Atomic JSONB metadata merge for the latest active inv_security_terms row
CREATE OR REPLACE FUNCTION merge_security_terms_raw_terms(
  p_security_id bigint,
  p_new_raw_terms jsonb
)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE inv_security_terms
  SET raw_terms = COALESCE(raw_terms, '{}'::jsonb) || p_new_raw_terms,
  updated_at = NOW()
  WHERE id = (
    SELECT id
    FROM inv_security_terms
    WHERE security_id = p_security_id
      AND superseded_date IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  );
$$;
