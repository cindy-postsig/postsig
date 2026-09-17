-- Add client_entity_id to contract_versions to match contracts table

ALTER TABLE public.contract_versions
ADD COLUMN IF NOT EXISTS client_entity_id bigint;
