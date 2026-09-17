INSERT INTO "public"."investor_transaction_types" (
    "id",
    "code",
    "description",
    "created_at"
) VALUES
    ('1', 'NEW_CASH', 'New cash investment', '2026-01-19 22:18:16.937177+00'),
    ('2', 'CONVERSION', 'Conversion of an instrument', '2026-01-19 22:18:16.937177+00'),
    ('3', 'SECONDARY', 'Secondary sale', '2026-01-19 22:18:16.937177+00')
ON CONFLICT (id) DO NOTHING;