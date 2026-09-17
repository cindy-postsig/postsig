-- Step 1: Add the legacy column
ALTER TABLE "public"."contracts"
ADD COLUMN "legacy_subscription_term" text;

-- Step 2: Copy old values into the legacy column
UPDATE "public"."contracts"
SET "legacy_subscription_term" = "subscription_term";

-- Step 3: Drop the original column
ALTER TABLE "public"."contracts"
DROP COLUMN "subscription_term";

-- Step 4: Add the new subscription_term column with double precision type
ALTER TABLE "public"."contracts"
ADD COLUMN "subscription_term" double precision;
