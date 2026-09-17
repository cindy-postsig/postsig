-- Mirror external tracking columns from contracts onto contract_versions
-- These columns are captured via the existing versioning trigger so the
-- version history accurately reflects each change to these fields.
ALTER TABLE "public"."contract_versions"
    ADD COLUMN IF NOT EXISTS "external_source" text,
    ADD COLUMN IF NOT EXISTS "external_invoice_id" text,
    ADD COLUMN IF NOT EXISTS "decision_reason" text,
    ADD COLUMN IF NOT EXISTS "last_synced_at" timestamptz;
