-- Revert the default value changes
alter table "public"."contracts" alter column "cancel_date" drop default;
alter table "public"."contracts" alter column "term_end_date" drop default;
alter table "public"."contracts" alter column "term_start_date" drop default;

-- Clean up any malformed data
UPDATE contracts
SET cancel_date = NULL
WHERE cancel_date @> '[{"date": null}]'::jsonb
   OR cancel_date @> '[{}]'::jsonb;

UPDATE contracts
SET
    term_start_date = CASE
        WHEN term_start_date IN ('[]', '[{}]') THEN NULL
        ELSE term_start_date
    END,
    term_end_date = CASE
        WHEN term_end_date IN ('[]', '[{}]') THEN NULL
        ELSE term_end_date
    END,
    cancel_date = CASE
        WHEN cancel_date IN ('[]', '[{}]') THEN NULL
        ELSE cancel_date
    END
WHERE
    term_start_date IN ('[]', '[{}]')
    OR term_end_date IN ('[]', '[{}]')
    OR cancel_date IN ('[]', '[{}]');
