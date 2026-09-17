-- Behavioural check for the vendor merge functions, run against a local
-- database inside a rolled-back transaction. Every expectation is an ASSERT,
-- so a regression fails the run.
--
--   psql "$LOCAL_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/vendor-merge-check.sql
--
-- The 'duplicate' enum value is added outside the transaction (a new enum
-- value cannot be used in the transaction that adds it); that statement is
-- idempotent and matches 20260911110000_vendor_status_duplicate.sql. The
-- functions, the fixture and every write roll back at the end.

\set ON_ERROR_STOP on
ALTER TYPE "public"."VendorStatus" ADD VALUE IF NOT EXISTS 'duplicate';

BEGIN;
\i supabase/migrations/20260911120000_vendor_merge_functions.sql

CREATE TEMP TABLE f (k text PRIMARY KEY, v text);
CREATE FUNCTION pg_temp.fx(text) RETURNS text LANGUAGE sql AS 'SELECT v FROM f WHERE k = $1';

-- Fixture: loser L (active, has domain), survivor S (NULL status), X already
-- merged into L, partners P and Q.
WITH o AS (INSERT INTO organizations (name) VALUES ('vendor merge check') RETURNING id)
INSERT INTO f SELECT 'org', id::text FROM o;
WITH v AS (INSERT INTO vendors (name, domain, status) VALUES ('Bloomberg L.P.', 'bloomberg.com', 'active') RETURNING id)
INSERT INTO f SELECT 'l', id::text FROM v;
WITH v AS (INSERT INTO vendors (name, status) VALUES ('Bloomberg', NULL) RETURNING id)
INSERT INTO f SELECT 's', id::text FROM v;
WITH v AS (INSERT INTO vendors (name, status, merged_into_vendor_id) VALUES ('Bloomberg Old', 'merged', pg_temp.fx('l')::int) RETURNING id)
INSERT INTO f SELECT 'x', id::text FROM v;
WITH v AS (INSERT INTO vendors (name, status) VALUES ('Partner P', 'active') RETURNING id)
INSERT INTO f SELECT 'p', id::text FROM v;
WITH v AS (INSERT INTO vendors (name, status) VALUES ('Partner Q', 'active') RETURNING id)
INSERT INTO f SELECT 'q', id::text FROM v;

WITH v AS (INSERT INTO vendor_products (name, vendor_id) VALUES ('Terminal', pg_temp.fx('l')::int) RETURNING id)
INSERT INTO f SELECT 'lp_terminal', id::text FROM v;
WITH v AS (INSERT INTO vendor_products (name, vendor_id) VALUES ('Data License', pg_temp.fx('l')::int) RETURNING id)
INSERT INTO f SELECT 'lp_data', id::text FROM v;
WITH v AS (INSERT INTO vendor_products (name, vendor_id) VALUES ('terminal ', pg_temp.fx('s')::int) RETURNING id)
INSERT INTO f SELECT 'sp_terminal', id::text FROM v;
INSERT INTO vendor_products (name, vendor_id) VALUES ('BVAL', pg_temp.fx('s')::int);

WITH c AS (INSERT INTO contracts (organization_id, vendor_id) VALUES (pg_temp.fx('org')::uuid, pg_temp.fx('l')::int) RETURNING id)
INSERT INTO f SELECT 'c1', id::text FROM c;
WITH c AS (INSERT INTO contracts (organization_id, vendor_id) VALUES (pg_temp.fx('org')::uuid, pg_temp.fx('s')::int) RETURNING id)
INSERT INTO f SELECT 'c2', id::text FROM c;

WITH d AS (INSERT INTO vendor_products_details (product_id, contract_id, year)
           VALUES (pg_temp.fx('lp_terminal')::int, pg_temp.fx('c1')::int, 2024) RETURNING id)
INSERT INTO f SELECT 'lpd_2024', id::text FROM d;
INSERT INTO vendor_products_details (product_id, contract_id, year) VALUES
    (pg_temp.fx('lp_terminal')::int, pg_temp.fx('c1')::int, 2025),
    (pg_temp.fx('sp_terminal')::int, pg_temp.fx('c1')::int, 2024);
-- A fee line under the colliding 2024 row: it cascades away with the row and
-- must be captured in the report.
INSERT INTO vendor_products_eafs_fees (vpd_id, product_fee, period_months)
    VALUES (pg_temp.fx('lpd_2024')::int, 1200, 12);
-- Users rows are unique per (product, contract): the c2 row must move, the c1
-- row collides with the survivor's and is dropped.
INSERT INTO vendor_products_users (product_id, contract_id) VALUES
    (pg_temp.fx('lp_terminal')::int, pg_temp.fx('c1')::int),
    (pg_temp.fx('lp_terminal')::int, pg_temp.fx('c2')::int),
    (pg_temp.fx('sp_terminal')::int, pg_temp.fx('c1')::int);
INSERT INTO contract_product_credits (organization_id, contract_id, product_id, year, amount)
    VALUES (pg_temp.fx('org')::uuid, pg_temp.fx('c1')::int, pg_temp.fx('lp_terminal')::int, 1, 5);
INSERT INTO organization_vendor_settings (organization_id, vendor_id, settings, notes, primary_contact_name)
    VALUES (pg_temp.fx('org')::uuid, pg_temp.fx('l')::int, '{"ict_provider": true}', 'loser notes', 'Loser Contact');
INSERT INTO organization_vendor_settings (organization_id, vendor_id, settings, notes)
    VALUES (pg_temp.fx('org')::uuid, pg_temp.fx('s')::int, '{"ict_provider": false}', 'survivor notes');
INSERT INTO corporate_actions (action_type, effective_date, primary_vendor_id, secondary_vendor_id) VALUES
    ('merger', now(), pg_temp.fx('l')::int, pg_temp.fx('s')::int),
    ('acquisition', now(), pg_temp.fx('l')::int, pg_temp.fx('p')::int),
    ('acquisition', now(), pg_temp.fx('p')::int, pg_temp.fx('s')::int),
    ('name_change', now(), pg_temp.fx('l')::int, pg_temp.fx('q')::int);
INSERT INTO bloomberg_firmwide_accounts (organization_id, firmwide_id, vendor_id)
    VALUES (pg_temp.fx('org')::uuid, 987654321, pg_temp.fx('l')::int);

-- Preview reports the plan and leaves no trace.
DO $$
DECLARE
    l int := pg_temp.fx('l')::int;
    s int := pg_temp.fx('s')::int;
    r jsonb;
BEGIN
    r := vendor_merge_preview(l, s);
    ASSERT r->'blocking' = '[]'::jsonb, 'preview blocked: ' || r::text;
    ASSERT (r->'moved'->>'contracts')::int = 1, 'preview contracts';
    ASSERT (r->'moved'->>'vendor_products')::int = 1, 'preview products';
    ASSERT (r->>'reference_drops')::int = 2, 'preview drops';
    ASSERT jsonb_array_length(r->'product_merges') = 1, 'preview product merges';
    ASSERT jsonb_array_length(r->'settings_merged') = 1, 'preview settings merges';
    ASSERT jsonb_array_length(r->'corporate_actions_deleted') = 2, 'preview corp deletes';
    ASSERT (r->'moved'->>'vendors_repointed')::int = 1, 'preview chain flatten';
    ASSERT (SELECT status FROM vendors WHERE id = l) = 'active', 'preview changed loser status';
    ASSERT (SELECT count(*) FROM vendor_products WHERE vendor_id = l) = 2, 'preview moved products';
    ASSERT (SELECT count(*) FROM corporate_actions WHERE l IN (primary_vendor_id, secondary_vendor_id)) = 3, 'preview touched corp actions';
END $$;

-- Blocking conditions surface as messages, never as NULL.
DO $$
DECLARE
    l int := pg_temp.fx('l')::int;
    s int := pg_temp.fx('s')::int;
    x int := pg_temp.fx('x')::int;
BEGIN
    ASSERT vendor_merge_preview(l, l)->'blocking'->>0 LIKE '%same vendor%', 'same vendor';
    ASSERT vendor_merge_preview(999999999, s)->'blocking'->>0 LIKE '%does not exist%', 'missing loser';
    ASSERT vendor_merge_preview(s, x)->'blocking'->>0 LIKE '%already merged%', 'survivor retired';
    ASSERT vendor_merge_preview(x, s)->'blocking'->>0 LIKE '%already merged%', 'loser retired';
    ASSERT vendor_merge_preview(s, l)->'blocking' = '[]'::jsonb, 'reverse direction is legal';
END $$;

-- Apply refuses to drop reference rows unless told to.
DO $$
DECLARE
    l int := pg_temp.fx('l')::int;
    s int := pg_temp.fx('s')::int;
BEGIN
    BEGIN
        PERFORM vendor_merge_apply(l, s);
        RAISE EXCEPTION 'apply without allow_reference_drops must fail';
    EXCEPTION
        WHEN SQLSTATE 'VM001' THEN NULL;
    END;
END $$;

-- Apply.
DO $$
DECLARE
    l int := pg_temp.fx('l')::int;
    s int := pg_temp.fx('s')::int;
    x int := pg_temp.fx('x')::int;
    p int := pg_temp.fx('p')::int;
    q int := pg_temp.fx('q')::int;
    c1 int := pg_temp.fx('c1')::int;
    sp int := pg_temp.fx('sp_terminal')::int;
    r jsonb;
    settings_row organization_vendor_settings%ROWTYPE;
BEGIN
    r := vendor_merge_apply(l, s, TRUE);
    ASSERT r->'moved'->'contract_ids' = jsonb_build_array(c1), 'contract ids recorded';
    ASSERT jsonb_array_length(r->'product_merges'->0->'references'->'vendor_products_details'->'dropped_rows') = 1, 'dropped rows recorded';
    ASSERT (r->'product_merges'->0->'references'->'vendor_products_details'->'dropped_fees'->0->>'product_fee')::numeric = 1200, 'cascaded fee recorded';
    ASSERT r->'product_merges'->0->'references'->'vendor_products_details'->'dropped_versions' = '[]'::jsonb, 'cascaded versions recorded';
    ASSERT (SELECT count(*) FROM vendor_products_eafs_fees WHERE vpd_id = pg_temp.fx('lpd_2024')::int) = 0, 'fee cascaded away';
    ASSERT r->'product_merges'->0->'deleted_product' ? 'id', 'deleted product recorded';
    ASSERT jsonb_array_length(r->'corporate_actions_updated') = 1, 'corp updates recorded';

    ASSERT (SELECT status FROM vendors WHERE id = l) = 'duplicate', 'loser status';
    ASSERT (SELECT merged_into_vendor_id FROM vendors WHERE id = l) = s, 'loser pointer';
    ASSERT (SELECT status FROM vendors WHERE id = s) = 'active', 'survivor activated';
    ASSERT (SELECT merged_into_vendor_id FROM vendors WHERE id = x) = s, 'chain flattened';
    ASSERT (SELECT count(*) FROM current_vendors WHERE original_vendor_id IN (l, s, x) AND current_vendor_id = s) = 3, 'view resolves all three';

    ASSERT (SELECT vendor_id FROM contracts WHERE id = c1) = s, 'contract repointed';
    ASSERT (SELECT count(*) FROM vendor_products WHERE vendor_id = s) = 3, 'three products under survivor';
    ASSERT (SELECT count(*) FROM vendor_products WHERE vendor_id = l) = 0, 'no products under loser';
    ASSERT (SELECT array_agg(year ORDER BY year) FROM vendor_products_details WHERE product_id = sp) = ARRAY[2024, 2025], 'details merged';
    ASSERT (SELECT product_id FROM contract_product_credits WHERE contract_id = c1) = sp, 'credit repointed';
    ASSERT (SELECT array_agg(contract_id ORDER BY contract_id) FROM vendor_products_users WHERE product_id = sp) = ARRAY[c1, pg_temp.fx('c2')::int], 'users row on the other contract moved';
    ASSERT (r->'product_merges'->0->'references'->'vendor_products_users'->>'repointed')::int = 1, 'users repointed count';
    ASSERT (r->'product_merges'->0->'references'->'vendor_products_users'->>'dropped')::int = 1, 'users dropped count';

    SELECT * INTO settings_row FROM organization_vendor_settings WHERE vendor_id = s;
    ASSERT settings_row.settings->>'ict_provider' = 'true', 'ict flag OR-ed';
    ASSERT settings_row.notes = E'survivor notes\nloser notes', 'notes concatenated';
    ASSERT settings_row.primary_contact_name = 'Loser Contact', 'contact filled from loser';
    ASSERT (SELECT count(*) FROM organization_vendor_settings WHERE vendor_id = l) = 0, 'loser settings removed';

    ASSERT (SELECT count(*) FROM corporate_actions WHERE l IN (primary_vendor_id, secondary_vendor_id)) = 0, 'no corp actions on loser';
    ASSERT (SELECT count(*) FROM corporate_actions WHERE s IN (primary_vendor_id, secondary_vendor_id)) = 2, 'survivor corp actions';
    ASSERT (SELECT count(*) FROM corporate_actions WHERE primary_vendor_id = s AND secondary_vendor_id = q) = 1, 'name_change repointed';
    ASSERT (SELECT count(*) FROM corporate_actions WHERE LEAST(primary_vendor_id, secondary_vendor_id) = LEAST(p, s) AND GREATEST(primary_vendor_id, secondary_vendor_id) = GREATEST(p, s)) = 1, 'duplicate corp action removed';
    ASSERT (SELECT vendor_id FROM bloomberg_firmwide_accounts WHERE firmwide_id = 987654321) = s, 'bloomberg repointed';

    ASSERT vendor_merge_preview(l, s)->'blocking'->>0 LIKE '%already duplicate%', 'second merge rejected';
END $$;

\echo 'vendor-merge-check: all assertions passed (rolling back)'
ROLLBACK;
