INSERT INTO inv_stages (code, display_name, sort_order) VALUES
    ('pre_seed', 'Pre-Seed', 1),
    ('seed', 'Seed', 2),
    ('series_seed', 'Series Seed', 3),
    ('series_a', 'Series A', 4),
    ('series_b', 'Series B', 5),
    ('series_c', 'Series C', 6),
    ('series_d', 'Series D', 7),
    ('series_e', 'Series E', 8),
    ('growth', 'Growth', 9),
    ('pre_ipo', 'Pre-IPO', 10),
    ('merged', 'Merged', 11),
    ('acquired', 'Acquired', 12),
    ('dissolved', 'Dissolved', 13),
    ('other', 'Other', 99)
ON CONFLICT (code) DO NOTHING;
