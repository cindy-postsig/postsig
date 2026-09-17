-- Migration: Convert business_sponsor from text to jsonb array
-- Step 1: Add a temporary column to backup the data
ALTER TABLE contracts
ADD COLUMN business_sponsor_backup text;

-- Step 2: Copy existing data to backup column
UPDATE contracts
SET business_sponsor_backup = business_sponsor;

-- Step 3: Drop the original column
ALTER TABLE contracts
DROP COLUMN business_sponsor;

-- Step 4: Add the new jsonb column with default
ALTER TABLE contracts
ADD COLUMN business_sponsor jsonb DEFAULT '[]'::jsonb;

-- Step 5: Convert backed up data to jsonb array format
UPDATE contracts
SET business_sponsor =
  CASE
    WHEN business_sponsor_backup IS NOT NULL AND business_sponsor_backup != ''
    THEN jsonb_build_array(business_sponsor_backup)
    ELSE '[]'::jsonb
  END;

-- Step 6: Clean up - drop the backup column
ALTER TABLE contracts
DROP COLUMN business_sponsor_backup;
