-- Set default missing clauses settings for all organizations
-- These values match the exact fields checked in getMissingFields function
UPDATE organizations 
SET missing_clauses_settings = jsonb_build_array(
  -- For contract types 1, 2, 7 (Data, SaaS, API)
  'distribution_rights',
  'geo_restrictions',
  'derivative_works',
  'data_disposal_tnc',
  
  -- For contract types 1, 2 (Data, SaaS)
  'audit_requirements',
  'suspension_of_service',
  'marketing_rights',
  'service_level_agreements',
  
  -- For contract types 2, 7 (SaaS, API)
  'cancel_by_date',
  
  -- For contract types 2, 6 (SaaS, Subscription)
  'payment_terms',
  'subscription_term',
  'billing_frequency',
  
  -- For contract type 2 (SaaS)
  'number_of_users',
  'internal_external_users',
  'activities',
  'cancellation_process',
  'renewal_type'
)
WHERE missing_clauses_settings IS NULL OR 
      (missing_clauses_settings::text = '[]' OR missing_clauses_settings::text = '{}');