-- Migration: 20251014094740_add_extraction_stats_view
-- Purpose: Add a view to track extraction stats for contracts

DROP VIEW IF EXISTS public.extraction_stats;

create or replace view "public"."extraction_stats" as  WITH base AS (
         SELECT a.contract_id,
            a.created_at,
            ((a.activity_data ->> 'newStatusId'::text))::integer AS new_status_id
           FROM activities a
          WHERE (((a.activity_type)::text = 'status_changed'::text) AND ((a.activity_data ->> 'newStatusId'::text) = ANY (ARRAY['4'::text, '5'::text])))
        ), agg AS (
         SELECT b.contract_id,
            max(b.created_at) FILTER (WHERE (b.new_status_id = 5)) AS uploaded_at,
            max(b.created_at) FILTER (WHERE (b.new_status_id = 4)) AS published_at
           FROM base b
          GROUP BY b.contract_id
        )
 SELECT agg.contract_id,
    (agg.uploaded_at)::timestamp with time zone AS uploaded_at,
    (agg.published_at)::timestamp with time zone AS published_at,
        CASE
            WHEN ((agg.uploaded_at IS NOT NULL) AND (agg.published_at IS NOT NULL)) THEN (EXTRACT(epoch FROM (agg.published_at - agg.uploaded_at)))::bigint
            ELSE NULL::bigint
        END AS difference_seconds
   FROM agg;

COMMENT ON VIEW public.extraction_stats IS 'View to track the time taken for contracts to move from uploaded to published status.';

-- Grant access to authenticated users
GRANT SELECT ON public.extraction_stats TO authenticated;
