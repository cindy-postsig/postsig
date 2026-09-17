-- Add affiliate_transfer document type (ID 40)

INSERT INTO "public"."document_types" ("id", "module_id", "code", "name", "description") VALUES
(40, 2, 'affiliate_transfer', 'Affiliate Transfer', 'Affiliate transfer documents — records the transfer of securities or fund positions between affiliated funds, including source fund, destination fund, instrument (stage), quantity of shares/units, and transfer date')
ON CONFLICT (module_id, code) DO NOTHING;

-- Reset sequence to match highest ID
SELECT setval(pg_get_serial_sequence('document_types', 'id'), 40);
