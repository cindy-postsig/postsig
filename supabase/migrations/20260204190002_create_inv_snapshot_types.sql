-- Snapshot types lookup
CREATE TABLE IF NOT EXISTS inv_snapshot_types (
    id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code                  VARCHAR(30) NOT NULL UNIQUE,
    display_name          VARCHAR(50) NOT NULL,
    sort_order            SMALLINT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO inv_snapshot_types (code, display_name, sort_order) VALUES
    ('round_close', 'Round Close', 1),
    ('quarterly', 'Quarterly', 2),
    ('annual', 'Annual', 3),
    ('ad_hoc', 'Ad Hoc', 4)
ON CONFLICT (code) DO NOTHING;
