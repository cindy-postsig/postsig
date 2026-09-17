-- 20251119121845_add_publishing_stat_averages.sql
-- Add function to calculate publishing statistics averages

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_publishing_averages()
 RETURNS TABLE(last_30_days_avg_seconds numeric, overall_avg_seconds numeric, last_30_days_count bigint, overall_count bigint)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH valid_stats AS (
    SELECT 
      es.difference_seconds,
      es.uploaded_at
    FROM extraction_stats es
    INNER JOIN contracts c ON es.contract_id = c.id
    INNER JOIN organizations o ON c.organization_id = o.id
    WHERE 
      es.published_at IS NOT NULL
      AND es.uploaded_at IS NOT NULL
      AND es.difference_seconds IS NOT NULL
      AND es.difference_seconds > 0
      AND (o.is_demo_org IS NULL OR o.is_demo_org = FALSE)
  )
  SELECT
    COALESCE(ROUND(AVG(difference_seconds) FILTER (WHERE uploaded_at >= NOW() - INTERVAL '30 days')), 0)::NUMERIC,
    COALESCE(ROUND(AVG(difference_seconds)), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE uploaded_at >= NOW() - INTERVAL '30 days'),
    COUNT(*)
  FROM valid_stats;
END;
$function$
;


