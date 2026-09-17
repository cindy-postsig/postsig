alter table "public"."contracts" alter column "cancel_date" set default '[{}]'::jsonb;

alter table "public"."contracts" alter column "term_end_date" set default '[{}]'::jsonb;

alter table "public"."contracts" alter column "term_start_date" set default '[{}]'::jsonb;

UPDATE contracts
SET term_start_date = CASE
      WHEN term_start_date IS NULL THEN '[{}]'::jsonb
      ELSE term_start_date
    END,
    term_end_date = CASE
      WHEN term_end_date IS NULL THEN '[{}]'::jsonb
      ELSE term_end_date
    END,
    cancel_date = CASE
      WHEN cancel_date IS NULL THEN '[{}]'::jsonb
      ELSE cancel_date
    END
