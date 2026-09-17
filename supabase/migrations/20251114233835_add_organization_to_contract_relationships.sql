-- Add organization_id to contract_relationships for efficient org-level querying
-- This eliminates the need for N queries when processing contract hierarchies

-- Add the organization_id column
ALTER TABLE contract_relationships
  ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Create index for fast filtering by organization
CREATE INDEX idx_contract_rel_org
  ON contract_relationships(organization_id);

-- Backfill existing data from parent contracts
UPDATE contract_relationships cr
SET organization_id = (
  SELECT c.organization_id
  FROM contracts c
  WHERE c.id = cr.parent_contract_id
  LIMIT 1
);

-- Make it NOT NULL now that we've backfilled
-- Note: Contracts never change organizations, so no trigger needed
ALTER TABLE contract_relationships
  ALTER COLUMN organization_id SET NOT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN contract_relationships.organization_id IS
  'Organization ID for efficient filtering. Maintained by application code on insert. No trigger needed as contracts never change organizations.';
