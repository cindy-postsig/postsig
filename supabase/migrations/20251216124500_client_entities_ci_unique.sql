-- Make case-insensitive uniqueness for (name, address, organization_id)

-- Enable citext extension
CREATE EXTENSION IF NOT EXISTS citext;

-- Drop the existing unique constraint if present
ALTER TABLE public.client_entities
  DROP CONSTRAINT IF EXISTS client_entities_name_address_org_id_unique;

-- Convert columns to citext and enforce NOT NULL
ALTER TABLE public.client_entities
  ALTER COLUMN name TYPE citext USING name::citext,
  ALTER COLUMN address TYPE citext USING address::citext,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN address SET NOT NULL;

-- Add a standard UNIQUE constraint (now case-insensitive due to citext)
ALTER TABLE public.client_entities
  ADD CONSTRAINT client_entities_name_address_org_id_unique
  UNIQUE (name, address, organization_id);