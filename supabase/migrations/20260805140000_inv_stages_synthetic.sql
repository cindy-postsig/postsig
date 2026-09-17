-- Synthetic financing-round stages (psk-1854).
-- Portops books reclassifications and reverse/forward splits as first-class
-- rounds; the stage code is the discriminator. sort_order 94-96 keeps them
-- after every real/lifecycle stage and before 'other' (99) in stage selects.
INSERT INTO inv_stages (code, display_name, sort_order) VALUES
    ('reclassification', 'Reclassification', 94),
    ('reverse_split', 'Reverse Split', 95),
    ('forward_split', 'Forward Split', 96)
ON CONFLICT (code) DO NOTHING;
