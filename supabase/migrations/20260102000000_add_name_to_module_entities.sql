-- Add name column to module_entities for first-class entities not tied to a company
-- (e.g., funds which need their own name for matching)
ALTER TABLE module_entities ADD COLUMN IF NOT EXISTS name text;

-- Add index on name for efficient lookups
CREATE INDEX IF NOT EXISTS idx_module_entities_name
ON module_entities (name)
WHERE name IS NOT NULL;

-- GIN index on metadata->'funds' for efficient fund filtering on portfolio companies
CREATE INDEX IF NOT EXISTS idx_module_entities_metadata_funds
ON module_entities USING GIN ((metadata->'funds'));
