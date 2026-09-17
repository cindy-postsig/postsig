-- Invoice extraction: per-line detail, a Due Date, and an explicit spend flag.

ALTER TABLE "public"."vendor_products_details"
    ADD COLUMN "account_number" text,
    ADD COLUMN "quantity" numeric,
    ADD COLUMN "change_activity" text,
    ADD COLUMN "rate" numeric,
    ADD COLUMN "period_start" date,
    ADD COLUMN "period_end" date;

COMMENT ON COLUMN "public"."vendor_products_details"."account_number" IS 'Account this line is billed against, as printed on the invoice line. Optional.';
COMMENT ON COLUMN "public"."vendor_products_details"."quantity" IS 'Units billed on this line. Distinct from n_users: a line may bill terminals, keyboards or feeds rather than named users. Optional.';
COMMENT ON COLUMN "public"."vendor_products_details"."change_activity" IS 'Change activity noted against this line on the invoice (added, removed, amended). Optional, free text.';
COMMENT ON COLUMN "public"."vendor_products_details"."rate" IS 'Per-unit rate for this line. fees remains the line total; rate is not derived from it. Optional.';
COMMENT ON COLUMN "public"."vendor_products_details"."period_start" IS 'Start of the billing period this line covers. Independent of the contract-level term dates. Optional.';
COMMENT ON COLUMN "public"."vendor_products_details"."period_end" IS 'End of the billing period this line covers. Independent of the contract-level term dates. Optional.';

ALTER TABLE "public"."contracts"
    ADD COLUMN "due_date" date,
    ADD COLUMN "apply_to_overall_spend" boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN "public"."contracts"."due_date" IS 'Date payment on this invoice is due. Distinct from execution_date, which for an invoice is the invoice date.';
COMMENT ON COLUMN "public"."contracts"."apply_to_overall_spend" IS 'When true, this invoice contributes to overall spend (current estimated spend, TCV, the Spend tab). Replaces the previous rule that a parent-less invoice contributed automatically. Only read for invoice contract types.';

-- contract_versions mirrors the contracts columns it snapshots.
ALTER TABLE "public"."contract_versions"
    ADD COLUMN IF NOT EXISTS "due_date" date,
    ADD COLUMN IF NOT EXISTS "apply_to_overall_spend" boolean;

DROP INDEX IF EXISTS "public"."vendor_products_details_product_contract_year_unique";
