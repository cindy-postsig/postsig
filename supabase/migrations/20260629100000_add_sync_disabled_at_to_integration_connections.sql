ALTER TABLE integration_connections
  ADD COLUMN sync_disabled_at timestamptz;

-- Backfill: for connections where sync is already disabled, set sync_disabled_at to updated_at
UPDATE integration_connections
SET sync_disabled_at = updated_at
WHERE sync_enabled = false AND sync_disabled_at IS NULL;
