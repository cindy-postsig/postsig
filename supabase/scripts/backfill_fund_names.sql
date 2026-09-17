-- ONE-TIME SCRIPT: Backfill fund names and deduplicate
-- Run this after the migration adds the name column
-- Then run the unique index migration

-- Step 1: Backfill existing fund names from metadata
UPDATE module_entities
SET name = metadata->>'name'
WHERE entity_type = 'fund'
  AND name IS NULL
  AND metadata->>'name' IS NOT NULL;

-- Step 2: Create temp table of duplicates with the canonical (oldest) fund ID
CREATE TEMP TABLE fund_duplicates AS
WITH ranked_funds AS (
  SELECT
    id,
    organization_id,
    module_id,
    name,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, module_id, name
      ORDER BY created_at ASC
    ) as rn
  FROM module_entities
  WHERE entity_type = 'fund' AND name IS NOT NULL
)
SELECT
  f.id as duplicate_id,
  canonical.id as canonical_id,
  f.name
FROM ranked_funds f
JOIN ranked_funds canonical
  ON f.organization_id = canonical.organization_id
  AND f.module_id = canonical.module_id
  AND f.name = canonical.name
  AND canonical.rn = 1
WHERE f.rn > 1;

-- Show what will be deduplicated
SELECT * FROM fund_duplicates;

-- Step 3: Update portfolio companies that reference duplicate funds
UPDATE module_entities me
SET metadata = (
  SELECT jsonb_set(
    COALESCE(me.metadata, '{}'::jsonb),
    '{funds}',
    (
      SELECT jsonb_agg(
        CASE
          WHEN fd.canonical_id IS NOT NULL THEN jsonb_build_object('entity_id', fd.canonical_id)
          ELSE fund_ref
        END
      )
      FROM jsonb_array_elements(me.metadata->'funds') AS fund_ref
      LEFT JOIN fund_duplicates fd ON (fund_ref->>'entity_id')::int = fd.duplicate_id
    )
  )
)
WHERE me.entity_type = 'portfolio_company'
  AND me.metadata->'funds' IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(me.metadata->'funds') AS fund_ref
    JOIN fund_duplicates fd ON (fund_ref->>'entity_id')::int = fd.duplicate_id
  );

-- Step 4: Delete duplicate fund entities
DELETE FROM module_entities
WHERE id IN (SELECT duplicate_id FROM fund_duplicates);

DROP TABLE IF EXISTS fund_duplicates;

-- Step 5: Create unique index (prevents future duplicates from race conditions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_module_entities_fund_unique_name
ON module_entities (organization_id, module_id, name)
WHERE entity_type = 'fund' AND name IS NOT NULL;
