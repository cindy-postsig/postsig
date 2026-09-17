CREATE TYPE "public"."invoice_status" AS ENUM (
  'review',
  'incomplete',
  'declined',
  'void',
  'paid',
  'approved'
);

ALTER TABLE "public"."contracts"
  ADD COLUMN "invoice_status" invoice_status;

CREATE INDEX contracts_invoice_status_idx
  ON public.contracts USING btree (invoice_status)
  WHERE invoice_status IS NOT NULL;
