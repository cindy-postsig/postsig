INSERT INTO "public"."investor_events" (
    "id",
    "event_key",
    "display_name",
    "description",
    "created_at"
) VALUES
    ('1', 'equity_round', 'Equity Round', NULL, '2026-01-24 11:06:02.778562+00'),
    ('2', 'safe', 'SAFE', NULL, '2026-01-24 11:06:02.778562+00'),
    ('3', 'convertible_note', 'Convertible Note', NULL, '2026-01-24 11:06:02.778562+00'),
    ('4', 'debt', 'Debt', NULL, '2026-01-24 11:06:02.778562+00'),
    ('5', 'secondary', 'Secondary', 'Secondary sale / transaction', '2026-01-24 11:06:02.778562+00'),
    ('6', 'warrant', 'Warrant', NULL, '2026-01-24 11:06:02.778562+00'),
    ('7', 'exit', 'Exit', NULL, '2026-01-24 11:06:02.778562+00')
ON CONFLICT (id) DO NOTHING;

-- Advance sequence to avoid duplicate key errors on future inserts
SELECT setval('investor_events_id_seq', COALESCE((SELECT MAX(id) FROM investor_events), 0));