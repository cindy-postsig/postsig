-- Step 1: Add the legacy column
alter table "public"."contracts"
add column "legacy_renewal_period" text;

-- Step 2: Copy old values into the legacy column
update "public"."contracts"
set "legacy_renewal_period" = "renewal_period";

-- Step 3: Drop the original column
alter table "public"."contracts"
drop column "renewal_period";

-- Step 4: Add the new renewal_period column with integer type
alter table "public"."contracts"
add column "renewal_period" integer;
