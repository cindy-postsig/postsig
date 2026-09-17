-- First create the new JSON columns
ALTER TABLE contracts
ADD COLUMN term_end_date_jsonb jsonb,
ADD COLUMN term_start_date_jsonb jsonb,
ADD COLUMN cancel_date_jsonb jsonb;

-- Convert existing date data to JSON format using contracts.user_id
UPDATE contracts
SET
    term_end_date_jsonb = CASE
        WHEN term_end_date IS NOT NULL THEN
            jsonb_build_array(
                jsonb_build_object(
                    'date', term_end_date,
                    'updated_at', CURRENT_TIMESTAMP,
                    'updated_by', user_id::text
                )
            )
        ELSE NULL
    END,
    term_start_date_jsonb = CASE
        WHEN term_start_date IS NOT NULL THEN
            jsonb_build_array(
                jsonb_build_object(
                    'date', term_start_date,
                    'updated_at', CURRENT_TIMESTAMP,
                    'updated_by', user_id::text
                )
            )
        ELSE NULL
    END,
    cancel_date_jsonb = CASE
        WHEN cancel_date IS NOT NULL AND cancel_date::text != 'null' THEN
            jsonb_build_array(
                jsonb_build_object(
                    'date', NULLIF(cancel_date::text, 'null'),
                    'updated_at', CURRENT_TIMESTAMP,
                    'updated_by', user_id::text
                )
            )
        ELSE NULL
    END;

-- Drop the original columns
ALTER TABLE contracts
DROP COLUMN term_end_date,
DROP COLUMN term_start_date,
DROP COLUMN cancel_date;

-- Rename the new columns to the original names
ALTER TABLE contracts
RENAME COLUMN term_end_date_jsonb TO term_end_date;

ALTER TABLE contracts
RENAME COLUMN term_start_date_jsonb TO term_start_date;

ALTER TABLE contracts
RENAME COLUMN cancel_date_jsonb TO cancel_date;
