-- Contract step of the period-granularity expand/contract (see
-- 20260819120000).
--
-- APPLY ONLY AFTER the droid, nextjs and hextraction releases that target the
-- v2 unique keys are all deployed. Until then, deployed code upserts against
-- the 5-column conflict targets dropped here, and dropping them early turns
-- every KPI save into an error.
--
-- Monthly rows are blocked until this applies: under the old
-- NULLS NOT DISTINCT cell key, two months of the same year (both
-- quarter-NULL) read as one cell.

ALTER TABLE inv_kpi_value
    DROP CONSTRAINT inv_kpi_value_cell_uq;

ALTER TABLE inv_kpi_reporting_completion
    DROP CONSTRAINT inv_kpi_reporting_completion_cell_uq;
