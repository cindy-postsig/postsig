-- Record which model produced an extraction run.
--
-- The analyst can now pick a model per run (Gemini or Claude, both via Vertex),
-- so a run is only comparable to another if you know what produced it. Stored
-- as its own column rather than inside `result` so the runs list can filter and
-- index on it, and so the model survives on failed runs — where `result` is
-- null and the model is exactly what you want to know.
--
-- Nullable with no default: rows written before this column existed genuinely
-- have an unknown model, and backfilling them with today's default would assert
-- something untrue. The app renders null as "—".
ALTER TABLE inv_kpi_extraction_run
    ADD COLUMN model_id TEXT;

COMMENT ON COLUMN inv_kpi_extraction_run.model_id IS
    'Model that produced this run (e.g. gemini-3.6-flash, claude-sonnet-4-6). Null for runs predating per-run model selection.';

-- Supports the runs list filtering by model within an organization. Partial:
-- pre-selection rows are null and are never filtered on.
CREATE INDEX idx_inv_kpi_extraction_run_model
    ON inv_kpi_extraction_run (organization_id, model_id)
    WHERE model_id IS NOT NULL;
