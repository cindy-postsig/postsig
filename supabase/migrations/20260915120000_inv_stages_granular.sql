-- Granular financing stages.
--
-- Adds sub-stage rows (`<base>_1`..`<base>_5`) and extension rows
-- (`<base>_ext`) for every priced stage. They are ordinary stages: a round on
-- series_a_1 is no more a child of series_a than series_b is. Nothing links a
-- granular row back to the stage it was named after.
--
-- sort_order is re-spaced so the codes that read as a family list together in
-- stage selects. It is display-only; no view or query orders data by it.

-- Re-space existing rows so the new codes can slot in beside them.
UPDATE inv_stages SET sort_order = v.sort_order
FROM (VALUES
    ('pre_seed', 10),
    ('seed', 20),
    ('series_seed', 30),
    ('series_a', 40),
    ('series_b', 50),
    ('series_c', 60),
    ('series_d', 70),
    ('series_e', 80),
    ('series_f', 90),
    ('series_g', 100),
    ('growth', 110),
    ('pre_ipo', 120),
    ('merged', 130),
    ('acquired', 140),
    ('dissolved', 150),
    ('reclassification', 940),
    ('reverse_split', 950),
    ('forward_split', 960),
    ('other', 990)
) AS v(code, sort_order)
WHERE inv_stages.code = v.code
  AND inv_stages.sort_order IS DISTINCT FROM v.sort_order;

-- Sub-stages: `<base>_<n>` / "<Base>-<n>" for n in 1..5.
-- pre_seed is excluded: it takes an extension but no numbered sub-stages.
INSERT INTO inv_stages (code, display_name, sort_order)
SELECT
    b.code || '_' || n,
    b.display_name || '-' || n,
    b.sort_order + n
FROM inv_stages b
CROSS JOIN generate_series(1, 5) AS n
WHERE b.code IN (
    'seed', 'series_seed', 'series_a', 'series_b', 'series_c',
    'series_d', 'series_e', 'series_f', 'series_g'
)
ON CONFLICT (code) DO NOTHING;

-- Extensions: `<base>_ext` / "<Base> Extension".
INSERT INTO inv_stages (code, display_name, sort_order)
SELECT
    b.code || '_ext',
    b.display_name || ' Extension',
    b.sort_order + 6
FROM inv_stages b
WHERE b.code IN (
    'pre_seed', 'seed', 'series_seed', 'series_a', 'series_b', 'series_c',
    'series_d', 'series_e', 'series_f', 'series_g'
)
ON CONFLICT (code) DO NOTHING;
