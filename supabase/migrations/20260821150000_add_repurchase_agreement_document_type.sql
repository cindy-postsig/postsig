-- Add repurchase_agreement document type (ID 42)

INSERT INTO "public"."document_types" ("id", "module_id", "code", "name", "description") VALUES
(42, 2, 'repurchase_agreement', 'Repurchase Agreement', 'Repurchase Agreement documents — the agreement granting the company or an investor the right to buy back a holder''s shares on specified trigger events, including repurchase type and parties, shares subject to repurchase, repurchase price, trigger events, exercise of the repurchase right, and lapse or termination provisions')
ON CONFLICT (module_id, code) DO NOTHING;

-- Reset sequence to match highest ID
SELECT setval(pg_get_serial_sequence('document_types', 'id'), 42);
