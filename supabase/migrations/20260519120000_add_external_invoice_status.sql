-- Track the original status of the invoice in the external system (Xero/Ramp).
ALTER TABLE "public"."contracts"
    ADD COLUMN "external_invoice_status" text;

CREATE INDEX contracts_external_invoice_status_idx
    ON public.contracts (external_invoice_status)
    WHERE external_invoice_status IS NOT NULL;

ALTER TABLE "public"."contract_versions"
    ADD COLUMN IF NOT EXISTS "external_invoice_status" text;
