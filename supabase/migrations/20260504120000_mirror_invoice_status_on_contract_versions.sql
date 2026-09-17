ALTER TABLE "public"."contract_versions"
  ADD COLUMN IF NOT EXISTS "invoice_status" invoice_status;
