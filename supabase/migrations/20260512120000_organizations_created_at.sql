-- Add created_at to organizations. Idempotent so it can be re-applied
-- after manually adding the column during testing.
ALTER TABLE "public"."organizations"
ADD COLUMN IF NOT EXISTS "created_at" timestamptz NOT NULL DEFAULT now();
