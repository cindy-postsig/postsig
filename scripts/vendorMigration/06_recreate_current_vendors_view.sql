-- Migration File: 06_recreate_current_vendors_view.sql
-- Purpose: Recreate the current_vendors view, adapting its original recursive logic
--          to use the new public.vendors and public.corporate_actions tables.

DROP VIEW IF EXISTS public.current_vendors;

create or replace view "public"."current_vendors" as  WITH RECURSIVE vendor_lineage AS (
         SELECT vendors.id AS original_vendor_id,
            vendors.id AS current_vendor_id,
            vendors.name AS current_vendor_name
           FROM vendors
          WHERE (vendors.status = 'active'::"VendorStatus")
        UNION ALL
         SELECT v.id AS original_vendor_id,
            vl.current_vendor_id,
            vl.current_vendor_name
           FROM (vendors v
             JOIN vendor_lineage vl ON ((v.merged_into_vendor_id = vl.original_vendor_id)))
          WHERE (v.status = ANY (ARRAY['merged'::"VendorStatus", 'acquired'::"VendorStatus"]))
        )
 SELECT DISTINCT vendor_lineage.original_vendor_id,
    vendor_lineage.current_vendor_id,
    vendor_lineage.current_vendor_name
   FROM vendor_lineage;

COMMENT ON VIEW public.current_vendors IS 'Recreates the vendor lineage logic. For each vendor, it traces through corporate_actions (mergers, acquisitions) to find the ultimate current vendor ID and name.'; 


-- CREATE OR REPLACE VIEW public.current_vendors AS
-- WITH RECURSIVE vendor_lineage AS (
--     -- Anchor: Start with all vendors from the new vendors table.
--     -- Each vendor is initially considered its own "current" representative.
--     SELECT
--         v_initial.id AS original_vendor_id,
--         v_initial.id AS current_vendor_id,    -- This ID will be traced
--         v_initial.name AS current_vendor_name -- This name will be updated
--     FROM
--         public.vendors v_initial
--     -- No explicit 'active' status check here for the anchor,
--     -- as all vendors in the new table are considered starting points.
--     -- The "current" status is derived by following the corporate actions chain.

--     UNION ALL

--     -- Recursive step: If a vendor (vl.current_vendor_id) was a primary_vendor_id
--     -- in a merger/acquisition, update current_vendor_id to the secondary_vendor_id (the successor).
--     SELECT
--         vl.original_vendor_id,                 -- Keep the original_vendor_id from the previous step
--         ca.secondary_vendor_id AS current_vendor_id, -- This is the new "current" vendor
--         successor_vendor.name AS current_vendor_name -- Get the name of the successor vendor
--     FROM
--         vendor_lineage vl
--     JOIN
--         public.corporate_actions ca
--         ON vl.current_vendor_id = ca.primary_vendor_id -- The vendor we are tracking is the one being superseded
--     JOIN
--         public.vendors successor_vendor -- Join to get the name of the new current vendor
--         ON ca.secondary_vendor_id = successor_vendor.id
--     WHERE
--         ca.action_type IN ('merger', 'acquisition') -- These actions mean primary_vendor_id is superseded
--         AND ca.secondary_vendor_id IS NOT NULL     -- Make sure there is a successor
-- )
-- -- Select the final state for each original vendor.
-- -- The true "current" vendor is the one that is NOT a primary_vendor_id in any further
-- -- 'merger' or 'acquisition' corporate actions.
-- SELECT DISTINCT
--     vl.original_vendor_id,
--     vl.current_vendor_id,
--     vl.current_vendor_name
-- FROM
--     vendor_lineage vl
-- WHERE
--     NOT EXISTS (
--         SELECT 1
--         FROM public.corporate_actions ca_sub
--         WHERE ca_sub.primary_vendor_id = vl.current_vendor_id
--           AND ca_sub.action_type IN ('merger', 'acquisition')
--           AND ca_sub.secondary_vendor_id IS NOT NULL
--     );