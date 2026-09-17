-- Migration script 01b: Populate organization_vendor_settings
-- This script runs AFTER 01_g_vendors.sql
-- It populates the organization_vendor_settings table with organization-specific
-- ICT provider statuses for each consolidated global vendor.

BEGIN;

-- 1. Verify that prerequisite tables exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vendors' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'Original vendors table not found. Run previous migration scripts first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'Users table not found. This table is required to link vendors to organizations.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'map_old_vendor_to_global' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'map_old_vendor_to_global table not found. Run 01_g_vendors.sql first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organization_vendor_settings' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'organization_vendor_settings table not found. Run 00_table_setup.sql with updates first.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'organizations' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'organizations table not found. This table is required for FK constraints.';
    END IF;
END$$;

-- 2. Populate organization_vendor_settings
-- This query assumes:
--   - 'vendors' table is the original, unconsolidated table at this stage.
--   - 'users' table links users to organizations via 'organization_id'.
--   - 'vendors.user_id' links to 'users.id'.
--   - 'map_old_vendor_to_global' links old vendor IDs to new global_vendor_ids.
--   - 'organization_vendor_settings' has a PK on (organization_id, vendor_id).

DO $$
BEGIN
    RAISE NOTICE 'Populating organization_vendor_settings...';

    INSERT INTO organization_vendor_settings (organization_id, vendor_id, settings, created_at, updated_at)
    SELECT
        u.organization_id,
        movg.global_vendor_id, -- This is the ID from the global_vendors table
        jsonb_build_object('ict_provider', COALESCE(BOOL_OR(v_orig.ict_provider), FALSE)) AS vendor_settings, -- Store as JSON
        now(),
        now()
    FROM
        vendors v_orig -- Querying the original vendors data (live table at this stage of migration)
    JOIN
        users u ON v_orig.user_id = u.id
    JOIN
        map_old_vendor_to_global movg ON v_orig.id = movg.old_vendor_id
    WHERE
        u.organization_id IS NOT NULL -- Ensure the user is associated with an organization
        -- AND v_orig.ict_provider IS NOT NULL -- Optional: if you only want to store explicit true/false
    GROUP BY
        u.organization_id,
        movg.global_vendor_id
    ON CONFLICT (organization_id, vendor_id) DO UPDATE SET
        settings = organization_vendor_settings.settings || EXCLUDED.settings, -- Merge settings on conflict
        updated_at = now();
END$$;

-- 3. Verify population
DO $$
DECLARE
    settings_count INT;
    expected_combinations INT;
BEGIN
    SELECT COUNT(*) INTO settings_count FROM organization_vendor_settings;
    RAISE NOTICE 'Inserted % records into organization_vendor_settings.', settings_count;

    -- Calculate a rough expected count for sanity checking
    SELECT COUNT(DISTINCT (u.organization_id, movg.global_vendor_id))
    INTO expected_combinations
    FROM vendors v_orig
    JOIN users u ON v_orig.user_id = u.id
    JOIN map_old_vendor_to_global movg ON v_orig.id = movg.old_vendor_id
    WHERE u.organization_id IS NOT NULL;

    RAISE NOTICE 'Expected roughly % unique (organization, global_vendor) combinations with ICT provider data.', expected_combinations;

    IF settings_count = 0 AND expected_combinations > 0 THEN
        RAISE WARNING 'organization_vendor_settings is empty, but expected data. Check source tables and user_id/organization_id links.';
    ELSIF settings_count > 0 AND settings_count < expected_combinations THEN
        RAISE WARNING 'organization_vendor_settings has fewer records (%) than expected (%). Some org/vendor combinations might be missing.', settings_count, expected_combinations;
    END IF;
END$$;

COMMIT; 