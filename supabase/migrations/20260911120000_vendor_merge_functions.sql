-- Merge one duplicate vendors row (the loser) into another (the survivor).
--
-- vendors is a global table with no name normalisation, so the same company
-- accumulates several rows ("Bloomberg", "Bloomberg L.P."). The 2025
-- consolidation only collapsed exact-name matches. These functions retire one
-- duplicate at a time, atomically, from scripts/merge-duplicate-vendor.ts.
--
-- What a merge does:
--   * repoints contracts, vendor_products, bloomberg_firmwide_accounts,
--     organization_vendor_settings and corporate_actions from loser to survivor
--   * merges colliding vendor_products (same name, case/space-insensitive)
--     into the survivor's product, moving every product reference table
--   * merges colliding organization_vendor_settings rows (composite PK)
--     rather than losing contact details or the DORA ict_provider flag
--   * deletes corporate_actions rows that would become self-referential or
--     duplicate an existing survivor pairing
--   * marks the loser status='duplicate', merged_into_vendor_id=survivor so
--     current_vendors keeps redirecting any stale reference, while ingestion
--     and pickers can exclude it precisely (see 20260911110000)
--
-- What it deliberately leaves alone:
--   * the loser row itself: vendor_products.vendor_id is ON DELETE CASCADE, and
--     contract_versions / vendor_products_versions / audit_log keep historical
--     vendor ids without a FK
--   * survivor attributes (domain, email, ...): an UPDATE OF domain fires
--     trigger_update_vendor_description, which makes outbound HTTP calls
--   * contract_relationships.metadata.vendor_id and audit_log: historical
--
-- Alternatives considered:
--   * soft merge only (set the pointer, keep contracts on the loser): this is
--     the read-side idiom in postsig-nextjs, but hextraction's vendor reads
--     and bloomberg_firmwide_accounts never resolve through current_vendors
--   * hard delete of the loser: cascades through vendor_products and strands
--     the historical ids above
--   * one PostgREST request per row from the script: no transaction, so a
--     failure leaves a half-merged vendor
--
-- Rollback: the returned report lists every repointed id and the full content
-- of every deleted row; the script saves it under tmp/vendor-merges/.
-- Reversal is manual from that file. Revisit the physical repoint if every
-- vendor_id reader canonicalises through current_vendors.
--
-- Materialized views (admin_activity_logs_mv, admin_org_module_monthly_mv,
-- admin_org_module_uploads_mv) and the Redis contract/vendor caches are
-- refreshed by the calling script, not here.
--
-- Blocking conditions raise SQLSTATE 'VM001'. vendor_merge_preview runs the
-- full apply path inside a subtransaction and rolls it back with 'VM002', so
-- the preview report is exactly what apply would do. (A code ending in 000
-- would match the whole class, so the sentinel must not be 'VM000'.)

-- current_vendors resolves duplicates the same way as merged/acquired rows.
CREATE OR REPLACE VIEW "public"."current_vendors" AS
    WITH RECURSIVE vendor_lineage AS (
        SELECT vendors.id AS original_vendor_id,
               vendors.id AS current_vendor_id,
               vendors.name AS current_vendor_name
          FROM vendors
         WHERE vendors.status = 'active'::"VendorStatus"
        UNION ALL
        SELECT v.id AS original_vendor_id,
               vl.current_vendor_id,
               vl.current_vendor_name
          FROM vendors v
          JOIN vendor_lineage vl ON v.merged_into_vendor_id = vl.original_vendor_id
         WHERE v.status = ANY (ARRAY['merged'::"VendorStatus", 'acquired'::"VendorStatus", 'duplicate'::"VendorStatus"])
    )
    SELECT DISTINCT vendor_lineage.original_vendor_id,
           vendor_lineage.current_vendor_id,
           vendor_lineage.current_vendor_name
      FROM vendor_lineage;

CREATE OR REPLACE FUNCTION public.vendor_merge_move_product_refs(
    p_from_product INTEGER,
    p_to_product INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_moved INTEGER;
    v_dropped INTEGER;
    v_dropped_rows jsonb;
    v_cascade_fees jsonb;
    v_cascade_versions jsonb;
    v_product_row jsonb;
    v_result jsonb := '{}'::jsonb;
BEGIN
    -- Each block: repoint rows that do not collide with the survivor product's
    -- unique key, then delete what is left (the survivor already has an
    -- equivalent row), keeping the deleted rows in the report. Predicates
    -- mirror the unique indexes on each table.

    -- vendor_products_details (product_id, contract_id, year)
    UPDATE vendor_products_details d SET product_id = p_to_product
     WHERE d.product_id = p_from_product
       AND NOT EXISTS (
           SELECT 1 FROM vendor_products_details x
            WHERE x.product_id = p_to_product
              AND x.contract_id = d.contract_id
              AND x.year = d.year);
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    -- Deleting a details row cascades to its fee lines and version snapshots;
    -- capture them first so the report is a complete rollback record.
    SELECT coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) INTO v_cascade_fees
      FROM vendor_products_eafs_fees f
     WHERE f.vpd_id IN (SELECT id FROM vendor_products_details WHERE product_id = p_from_product);
    SELECT coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) INTO v_cascade_versions
      FROM vendor_products_details_versions v
     WHERE v.vendor_products_details_id IN (SELECT id FROM vendor_products_details WHERE product_id = p_from_product);
    WITH del AS (
        DELETE FROM vendor_products_details WHERE product_id = p_from_product RETURNING *)
    SELECT count(*), coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb)
      INTO v_dropped, v_dropped_rows FROM del;
    v_result := v_result || jsonb_build_object('vendor_products_details',
        jsonb_build_object('repointed', v_moved, 'dropped', v_dropped, 'dropped_rows', v_dropped_rows,
                           'dropped_fees', v_cascade_fees, 'dropped_versions', v_cascade_versions));

    -- vendor_products_users (product_id, contract_id)
    UPDATE vendor_products_users u SET product_id = p_to_product
     WHERE u.product_id = p_from_product
       AND NOT EXISTS (
           SELECT 1 FROM vendor_products_users x
            WHERE x.product_id = p_to_product
              AND x.contract_id = u.contract_id);
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    WITH del AS (
        DELETE FROM vendor_products_users WHERE product_id = p_from_product RETURNING *)
    SELECT count(*), coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb)
      INTO v_dropped, v_dropped_rows FROM del;
    v_result := v_result || jsonb_build_object('vendor_products_users',
        jsonb_build_object('repointed', v_moved, 'dropped', v_dropped, 'dropped_rows', v_dropped_rows));

    -- contract_users (contract_id, email, coalesce(product_id, 0))
    UPDATE contract_users c SET product_id = p_to_product
     WHERE c.product_id = p_from_product
       AND NOT EXISTS (
           SELECT 1 FROM contract_users x
            WHERE x.product_id = p_to_product
              AND x.contract_id = c.contract_id
              AND x.email = c.email);
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    WITH del AS (
        DELETE FROM contract_users WHERE product_id = p_from_product RETURNING *)
    SELECT count(*), coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb)
      INTO v_dropped, v_dropped_rows FROM del;
    v_result := v_result || jsonb_build_object('contract_users',
        jsonb_build_object('repointed', v_moved, 'dropped', v_dropped, 'dropped_rows', v_dropped_rows));

    -- vendor_products_versions (vendor_product_id, version_id)
    UPDATE vendor_products_versions v SET vendor_product_id = p_to_product
     WHERE v.vendor_product_id = p_from_product
       AND NOT EXISTS (
           SELECT 1 FROM vendor_products_versions x
            WHERE x.vendor_product_id = p_to_product
              AND x.version_id = v.version_id);
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    WITH del AS (
        DELETE FROM vendor_products_versions WHERE vendor_product_id = p_from_product RETURNING *)
    SELECT count(*), coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb)
      INTO v_dropped, v_dropped_rows FROM del;
    v_result := v_result || jsonb_build_object('vendor_products_versions',
        jsonb_build_object('repointed', v_moved, 'dropped', v_dropped, 'dropped_rows', v_dropped_rows));

    -- vendor_product_lineage_events (contract_id, action, coalesce(product_id, 0))
    -- WHERE status <> 'rejected'
    UPDATE vendor_product_lineage_events e SET product_id = p_to_product
     WHERE e.product_id = p_from_product
       AND (e.status = 'rejected' OR NOT EXISTS (
           SELECT 1 FROM vendor_product_lineage_events x
            WHERE x.product_id = p_to_product
              AND x.contract_id = e.contract_id
              AND x.action = e.action
              AND x.status <> 'rejected'));
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    WITH del AS (
        DELETE FROM vendor_product_lineage_events WHERE product_id = p_from_product RETURNING *)
    SELECT count(*), coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb)
      INTO v_dropped, v_dropped_rows FROM del;
    v_result := v_result || jsonb_build_object('vendor_product_lineage_events',
        jsonb_build_object('repointed', v_moved, 'dropped', v_dropped, 'dropped_rows', v_dropped_rows));

    -- contract_cost_allocations (contract_id, product_id) NULLS NOT DISTINCT
    UPDATE contract_cost_allocations a SET product_id = p_to_product
     WHERE a.product_id = p_from_product
       AND NOT EXISTS (
           SELECT 1 FROM contract_cost_allocations x
            WHERE x.product_id = p_to_product
              AND x.contract_id = a.contract_id);
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    WITH del AS (
        DELETE FROM contract_cost_allocations WHERE product_id = p_from_product RETURNING *)
    SELECT count(*), coalesce(jsonb_agg(to_jsonb(del)), '[]'::jsonb)
      INTO v_dropped, v_dropped_rows FROM del;
    v_result := v_result || jsonb_build_object('contract_cost_allocations',
        jsonb_build_object('repointed', v_moved, 'dropped', v_dropped, 'dropped_rows', v_dropped_rows));

    -- contract_product_credits: no unique key on product_id
    UPDATE contract_product_credits SET product_id = p_to_product
     WHERE product_id = p_from_product;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    v_result := v_result || jsonb_build_object('contract_product_credits',
        jsonb_build_object('repointed', v_moved, 'dropped', 0, 'dropped_rows', '[]'::jsonb));

    DELETE FROM vendor_products WHERE id = p_from_product RETURNING to_jsonb(vendor_products) INTO v_product_row;

    RETURN v_result || jsonb_build_object('deleted_product', v_product_row);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vendor_merge_apply(
    p_loser INTEGER,
    p_survivor INTEGER,
    p_allow_reference_drops BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_loser vendors%ROWTYPE;
    v_survivor vendors%ROWTYPE;
    v_warnings jsonb := '[]'::jsonb;
    v_moved jsonb := '{}'::jsonb;
    v_ids jsonb;
    v_product_merges jsonb := '[]'::jsonb;
    v_settings_merged jsonb := '[]'::jsonb;
    v_corp_updated jsonb := '[]'::jsonb;
    v_corp_deleted jsonb := '[]'::jsonb;
    v_org_ids jsonb;
    v_refs jsonb;
    v_drops INTEGER := 0;
    v_count INTEGER;
    v_resolved INTEGER;
    v_missing TEXT[];
    v_new_primary INTEGER;
    v_new_secondary INTEGER;
    v_merged_settings jsonb;
    v_ict BOOLEAN;
    r RECORD;
BEGIN
    -- Preconditions (operator input): raise VM001 so the caller can report them.
    IF p_loser IS NULL OR p_survivor IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = 'both loser and survivor vendor ids are required';
    END IF;
    IF p_loser = p_survivor THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = 'loser and survivor are the same vendor';
    END IF;

    -- Lock both rows in id order so two concurrent merges cannot deadlock.
    PERFORM 1 FROM vendors WHERE id IN (p_loser, p_survivor) ORDER BY id FOR UPDATE;

    SELECT * INTO v_loser FROM vendors WHERE id = p_loser;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = format('loser vendor %s does not exist', p_loser);
    END IF;
    SELECT * INTO v_survivor FROM vendors WHERE id = p_survivor;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = format('survivor vendor %s does not exist', p_survivor);
    END IF;

    IF v_survivor.status IN ('merged', 'acquired', 'duplicate') THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = format('survivor %s is already %s into vendor %s; merge into that vendor instead',
                p_survivor, v_survivor.status, v_survivor.merged_into_vendor_id);
    END IF;
    IF v_survivor.status = 'inactive' THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = format('survivor %s is inactive; current_vendors only resolves into active vendors', p_survivor);
    END IF;
    IF v_loser.status IN ('merged', 'acquired', 'duplicate') THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = format('loser %s is already %s into vendor %s',
                p_loser, v_loser.status, v_loser.merged_into_vendor_id);
    END IF;

    -- Cycle guard: the survivor's merged_into chain must not reach the loser.
    WITH RECURSIVE chain AS (
        SELECT id, merged_into_vendor_id, 1 AS depth FROM vendors WHERE id = p_survivor
        UNION ALL
        SELECT v.id, v.merged_into_vendor_id, c.depth + 1
          FROM vendors v JOIN chain c ON v.id = c.merged_into_vendor_id
         WHERE c.depth < 50
    )
    SELECT count(*) INTO v_count FROM chain WHERE id = p_loser;
    IF v_count > 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = format('survivor %s already resolves through loser %s; merging would create a cycle',
                p_survivor, p_loser);
    END IF;

    -- Warnings: nothing here blocks, but the operator should see it.
    IF v_loser.is_demo_vendor IS DISTINCT FROM v_survivor.is_demo_vendor THEN
        v_warnings := v_warnings || to_jsonb(format(
            'is_demo_vendor differs (loser=%s, survivor=%s)',
            v_loser.is_demo_vendor, v_survivor.is_demo_vendor));
    END IF;
    v_missing := ARRAY[]::TEXT[];
    IF v_loser.domain IS NOT NULL AND v_survivor.domain IS NULL THEN
        v_missing := array_append(v_missing, 'domain');
    END IF;
    IF v_loser.email IS NOT NULL AND v_survivor.email IS NULL THEN
        v_missing := array_append(v_missing, 'email');
    END IF;
    IF v_loser.address IS NOT NULL AND v_survivor.address IS NULL THEN
        v_missing := array_append(v_missing, 'address');
    END IF;
    IF v_loser.description IS NOT NULL AND v_survivor.description IS NULL THEN
        v_missing := array_append(v_missing, 'description');
    END IF;
    IF v_loser.phone IS NOT NULL AND v_survivor.phone IS NULL THEN
        v_missing := array_append(v_missing, 'phone');
    END IF;
    IF array_length(v_missing, 1) > 0 THEN
        v_warnings := v_warnings || to_jsonb(format(
            'loser has %s that the survivor lacks; vendor attributes are not copied, set them on the survivor by hand',
            array_to_string(v_missing, ', ')));
    END IF;
    IF v_loser.domain IS NOT NULL AND v_survivor.domain IS NOT NULL
       AND lower(v_loser.domain) <> lower(v_survivor.domain) THEN
        v_warnings := v_warnings || to_jsonb(format(
            'domains differ (loser=%s, survivor=%s); confirm these are the same company',
            v_loser.domain, v_survivor.domain));
    END IF;

    -- Organizations whose caches the caller must purge.
    SELECT coalesce(jsonb_agg(DISTINCT org), '[]'::jsonb) INTO v_org_ids
      FROM (
          SELECT organization_id AS org FROM contracts WHERE vendor_id = p_loser
          UNION
          SELECT organization_id FROM organization_vendor_settings WHERE vendor_id = p_loser
          UNION
          SELECT organization_id FROM bloomberg_firmwide_accounts WHERE vendor_id = p_loser
      ) o WHERE org IS NOT NULL;

    -- 1. Colliding products: merge the loser's product into the survivor's.
    FOR r IN
        SELECT DISTINCT ON (lp.id)
               lp.id AS loser_product_id, lp.name AS loser_name,
               sp.id AS survivor_product_id, sp.name AS survivor_name
          FROM vendor_products lp
          JOIN vendor_products sp
            ON sp.vendor_id = p_survivor
           AND lower(btrim(sp.name)) = lower(btrim(lp.name))
         WHERE lp.vendor_id = p_loser
         ORDER BY lp.id, sp.created_at NULLS LAST, sp.id
    LOOP
        v_refs := vendor_merge_move_product_refs(r.loser_product_id, r.survivor_product_id);
        SELECT coalesce(sum((value->>'dropped')::INTEGER), 0) INTO v_count
          FROM jsonb_each(v_refs) WHERE value ? 'dropped';
        v_drops := v_drops + v_count;
        v_product_merges := v_product_merges || jsonb_build_object(
            'loser_product_id', r.loser_product_id,
            'loser_name', r.loser_name,
            'survivor_product_id', r.survivor_product_id,
            'survivor_name', r.survivor_name,
            'references', v_refs - 'deleted_product',
            'deleted_product', v_refs->'deleted_product');
    END LOOP;
    IF v_drops > 0 AND NOT p_allow_reference_drops THEN
        RAISE EXCEPTION USING ERRCODE = 'VM001',
            MESSAGE = format('%s product reference row(s) would be dropped because the survivor product already has an equivalent row; re-run with allow_reference_drops after reviewing the preview', v_drops);
    END IF;
    IF v_drops > 0 THEN
        v_warnings := v_warnings || to_jsonb(format(
            '%s product reference row(s) dropped; dropped vendor_products_details rows cascade to vendor_products_eafs_fees and vendor_products_details_versions',
            v_drops));
    END IF;

    -- 2. Remaining products move as-is.
    WITH upd AS (
        UPDATE vendor_products SET vendor_id = p_survivor WHERE vendor_id = p_loser RETURNING id)
    SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_count, v_ids FROM upd;
    v_moved := v_moved || jsonb_build_object('vendor_products', v_count, 'vendor_product_ids', v_ids);

    -- 3. organization_vendor_settings: composite PK (organization_id, vendor_id).
    FOR r IN
        SELECT l.organization_id,
               to_jsonb(l) AS loser_row, to_jsonb(s) AS survivor_row,
               l.settings AS l_settings, s.settings AS s_settings,
               l.primary_contact_name AS l_name, s.primary_contact_name AS s_name,
               l.primary_contact_email AS l_email, s.primary_contact_email AS s_email,
               l.primary_contact_phone AS l_phone, s.primary_contact_phone AS s_phone,
               l.notes AS l_notes, s.notes AS s_notes
          FROM organization_vendor_settings l
          JOIN organization_vendor_settings s
            ON s.organization_id = l.organization_id AND s.vendor_id = p_survivor
         WHERE l.vendor_id = p_loser
    LOOP
        -- Survivor keys win; the DORA flag is OR-ed so a classification set on
        -- either row is never lost.
        v_merged_settings := coalesce(r.l_settings, '{}'::jsonb) || coalesce(r.s_settings, '{}'::jsonb);
        IF (r.l_settings ? 'ict_provider') OR (r.s_settings ? 'ict_provider') THEN
            -- Only a JSON boolean counts; any other type would fail the cast.
            v_ict := (jsonb_typeof(r.s_settings->'ict_provider') = 'boolean'
                      AND (r.s_settings->>'ict_provider')::BOOLEAN)
                  OR (jsonb_typeof(r.l_settings->'ict_provider') = 'boolean'
                      AND (r.l_settings->>'ict_provider')::BOOLEAN);
            v_merged_settings := v_merged_settings || jsonb_build_object('ict_provider', v_ict);
        END IF;

        UPDATE organization_vendor_settings SET
            primary_contact_name = coalesce(r.s_name, r.l_name),
            primary_contact_email = coalesce(r.s_email, r.l_email),
            primary_contact_phone = coalesce(r.s_phone, r.l_phone),
            notes = CASE
                WHEN r.s_notes IS NULL THEN r.l_notes
                WHEN r.l_notes IS NULL OR r.l_notes = r.s_notes THEN r.s_notes
                ELSE r.s_notes || E'\n' || r.l_notes
            END,
            settings = v_merged_settings,
            updated_at = now()
         WHERE organization_id = r.organization_id AND vendor_id = p_survivor;

        DELETE FROM organization_vendor_settings
         WHERE organization_id = r.organization_id AND vendor_id = p_loser;

        v_settings_merged := v_settings_merged || jsonb_build_object(
            'organization_id', r.organization_id,
            'loser', r.loser_row,
            'survivor_before', r.survivor_row,
            'settings_after', v_merged_settings);
    END LOOP;
    WITH upd AS (
        UPDATE organization_vendor_settings SET vendor_id = p_survivor
         WHERE vendor_id = p_loser RETURNING organization_id)
    SELECT count(*), coalesce(jsonb_agg(organization_id), '[]'::jsonb) INTO v_count, v_ids FROM upd;
    v_moved := v_moved || jsonb_build_object('organization_vendor_settings', v_count,
        'organization_vendor_settings_orgs', v_ids);

    -- 4. corporate_actions: unique on (LEAST, GREATEST) of the pair.
    FOR r IN
        SELECT * FROM corporate_actions
         WHERE primary_vendor_id = p_loser OR secondary_vendor_id = p_loser
         ORDER BY id
    LOOP
        v_new_primary := CASE WHEN r.primary_vendor_id = p_loser THEN p_survivor ELSE r.primary_vendor_id END;
        v_new_secondary := CASE WHEN r.secondary_vendor_id = p_loser THEN p_survivor ELSE r.secondary_vendor_id END;
        IF v_new_primary = v_new_secondary THEN
            DELETE FROM corporate_actions WHERE id = r.id;
            v_corp_deleted := v_corp_deleted || jsonb_build_object(
                'reason', 'would pair the survivor with itself', 'row', to_jsonb(r));
        ELSIF EXISTS (
            SELECT 1 FROM corporate_actions x
             WHERE x.id <> r.id
               AND LEAST(x.primary_vendor_id, x.secondary_vendor_id) = LEAST(v_new_primary, v_new_secondary)
               AND GREATEST(x.primary_vendor_id, x.secondary_vendor_id) = GREATEST(v_new_primary, v_new_secondary)
        ) THEN
            DELETE FROM corporate_actions WHERE id = r.id;
            v_corp_deleted := v_corp_deleted || jsonb_build_object(
                'reason', 'survivor already has a corporate action with the same vendor', 'row', to_jsonb(r));
        ELSE
            UPDATE corporate_actions
               SET primary_vendor_id = v_new_primary, secondary_vendor_id = v_new_secondary
             WHERE id = r.id;
            v_corp_updated := v_corp_updated || jsonb_build_object(
                'id', r.id,
                'before', jsonb_build_object('primary_vendor_id', r.primary_vendor_id,
                                             'secondary_vendor_id', r.secondary_vendor_id));
        END IF;
    END LOOP;
    v_moved := v_moved || jsonb_build_object('corporate_actions', jsonb_array_length(v_corp_updated));

    -- 5. Plain repoints (no unique keys involve vendor_id).
    WITH upd AS (
        UPDATE bloomberg_firmwide_accounts SET vendor_id = p_survivor
         WHERE vendor_id = p_loser RETURNING id)
    SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_count, v_ids FROM upd;
    v_moved := v_moved || jsonb_build_object('bloomberg_firmwide_accounts', v_count,
        'bloomberg_firmwide_account_ids', v_ids);

    -- audit_contracts_trigger writes one audit_log row per contract here.
    WITH upd AS (
        UPDATE contracts SET vendor_id = p_survivor WHERE vendor_id = p_loser RETURNING id)
    SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_count, v_ids FROM upd;
    v_moved := v_moved || jsonb_build_object('contracts', v_count, 'contract_ids', v_ids);

    -- 6. Vendors already merged into the loser now point straight at the
    -- survivor: the weekly alerts edge function only follows one hop.
    WITH upd AS (
        UPDATE vendors SET merged_into_vendor_id = p_survivor, updated_at = now()
         WHERE merged_into_vendor_id = p_loser RETURNING id)
    SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_count, v_ids FROM upd;
    v_moved := v_moved || jsonb_build_object('vendors_repointed', v_count, 'vendor_ids_repointed', v_ids);

    UPDATE vendors
       SET status = 'duplicate',
           merged_into_vendor_id = p_survivor,
           merger_effective_date = now(),
           updated_at = now()
     WHERE id = p_loser;
    -- current_vendors anchors on status = 'active'; a NULL survivor status
    -- would drop the whole lineage from the view.
    UPDATE vendors SET status = 'active', updated_at = now()
     WHERE id = p_survivor AND status IS NULL;

    -- Postconditions (internal invariants): a failure here is a bug, not an
    -- operator mistake, so it aborts the transaction with a plain error.
    SELECT count(*) INTO v_count FROM (
        SELECT 1 FROM contracts WHERE vendor_id = p_loser
        UNION ALL SELECT 1 FROM vendor_products WHERE vendor_id = p_loser
        UNION ALL SELECT 1 FROM organization_vendor_settings WHERE vendor_id = p_loser
        UNION ALL SELECT 1 FROM bloomberg_firmwide_accounts WHERE vendor_id = p_loser
        UNION ALL SELECT 1 FROM corporate_actions WHERE p_loser IN (primary_vendor_id, secondary_vendor_id)
        UNION ALL SELECT 1 FROM vendors WHERE merged_into_vendor_id = p_loser
    ) refs;
    IF v_count > 0 THEN
        RAISE EXCEPTION 'vendor_merge_apply postcondition failed: % live reference(s) to vendor % remain',
            v_count, p_loser;
    END IF;
    SELECT current_vendor_id INTO v_resolved FROM current_vendors WHERE original_vendor_id = p_loser;
    IF v_resolved IS DISTINCT FROM p_survivor THEN
        RAISE EXCEPTION 'vendor_merge_apply postcondition failed: current_vendors resolves % to % instead of %',
            p_loser, v_resolved, p_survivor;
    END IF;

    RETURN jsonb_build_object(
        'loser', jsonb_build_object('id', v_loser.id, 'name', v_loser.name,
            'domain', v_loser.domain, 'status', v_loser.status),
        'survivor', jsonb_build_object('id', v_survivor.id, 'name', v_survivor.name,
            'domain', v_survivor.domain, 'status', v_survivor.status),
        'warnings', v_warnings,
        'moved', v_moved,
        'product_merges', v_product_merges,
        'reference_drops', v_drops,
        'settings_merged', v_settings_merged,
        'corporate_actions_updated', v_corp_updated,
        'corporate_actions_deleted', v_corp_deleted,
        'organization_ids', v_org_ids);
END;
$function$;

CREATE OR REPLACE FUNCTION public.vendor_merge_preview(
    p_loser INTEGER,
    p_survivor INTEGER
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_report jsonb;
BEGIN
    -- The apply path runs for real inside this subtransaction and is rolled
    -- back by the sentinel exception; plpgsql variables survive the rollback.
    BEGIN
        v_report := vendor_merge_apply(p_loser, p_survivor, TRUE);
        RAISE EXCEPTION USING ERRCODE = 'VM002', MESSAGE = 'vendor_merge_preview rollback';
    EXCEPTION
        WHEN SQLSTATE 'VM001' THEN
            RETURN jsonb_build_object('dry_run', TRUE, 'blocking', jsonb_build_array(SQLERRM));
        WHEN SQLSTATE 'VM002' THEN
            RETURN v_report || jsonb_build_object('dry_run', TRUE, 'blocking', '[]'::jsonb);
    END;
END;
$function$;

REVOKE ALL ON FUNCTION public.vendor_merge_move_product_refs(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vendor_merge_apply(INTEGER, INTEGER, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vendor_merge_preview(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vendor_merge_apply(INTEGER, INTEGER, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.vendor_merge_preview(INTEGER, INTEGER) TO service_role;
