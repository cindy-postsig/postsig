-- Add external source tracking and decision reason to contracts table
ALTER TABLE "public"."contracts"
    ADD COLUMN "external_source" text,
    ADD COLUMN "external_invoice_id" text,
    ADD COLUMN "decision_reason" text,
    ADD COLUMN "last_synced_at" timestamptz;

-- Unique partial index for deduplication: one contract per external invoice
CREATE UNIQUE INDEX contracts_external_source_invoice_id_unique
    ON public.contracts (organization_id, external_source, external_invoice_id)
    WHERE external_source IS NOT NULL AND external_invoice_id IS NOT NULL;

CREATE INDEX contracts_external_source_idx
    ON public.contracts (external_source)
    WHERE external_source IS NOT NULL;
