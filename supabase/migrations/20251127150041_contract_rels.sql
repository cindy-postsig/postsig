COMMENT ON COLUMN contract_relationships.organization_id IS NULL;

ALTER TABLE contract_relationships
  ALTER COLUMN organization_id DROP NOT NULL;

DROP INDEX IF EXISTS idx_contract_rel_org;

ALTER TABLE contract_relationships
  DROP COLUMN organization_id;