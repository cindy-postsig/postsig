INSERT INTO "public"."investor_stages" (
    "id",
    "stage_key",
    "display_name",
    "created_at"
) VALUES
    ('1', 'pre_seed', 'Pre-Seed', '2026-01-24 09:37:07.790685+00'),
    ('2', 'seed', 'Seed', '2026-01-24 09:37:07.790685+00'),
    ('3', 'series_a', 'Series A', '2026-01-24 09:37:07.790685+00'),
    ('4', 'series_b', 'Series B', '2026-01-24 09:37:07.790685+00'),
    ('5', 'series_c', 'Series C', '2026-01-24 09:37:07.790685+00'),
    ('6', 'series_d', 'Series D', '2026-01-24 09:37:07.790685+00'),
    ('7', 'series_e', 'Series E', '2026-01-24 09:37:07.790685+00'),
    ('8', 'post_ipo', 'Post-IPO', '2026-01-24 09:37:07.790685+00'),
    ('9', 'convertible_note', 'Convertible Note', '2026-01-24 09:37:07.790685+00'),
    ('10', 'grant', 'Grant', '2026-01-24 09:37:07.790685+00'),
    ('11', 'private_equity', 'Private Equity', '2026-01-24 09:37:07.790685+00'),
    ('12', 'other', 'Other', '2026-01-24 09:37:07.790685+00')
ON CONFLICT (id) DO NOTHING;