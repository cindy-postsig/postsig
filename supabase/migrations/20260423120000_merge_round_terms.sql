CREATE OR REPLACE FUNCTION merge_round_terms_raw(
    p_org_id uuid,
    p_round_id bigint,
    p_effective_date date,
    p_new_terms jsonb
  ) RETURNS void AS $$
    UPDATE inv_round_terms
    SET raw_terms = COALESCE(raw_terms, '{}'::jsonb) || p_new_terms
    WHERE organization_id = p_org_id
      AND financing_round_id = p_round_id
      AND (p_effective_date IS NULL OR effective_date = p_effective_date);
  $$ LANGUAGE sql;