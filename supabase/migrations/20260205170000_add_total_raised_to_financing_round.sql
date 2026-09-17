-- Add total_raised column to inv_financing_round
-- Stores "Total New Money" from equity financing CSV as authoritative source
-- Replaces unreliable transaction-based calculation

ALTER TABLE inv_financing_round
ADD COLUMN IF NOT EXISTS total_raised NUMERIC(20,2);

COMMENT ON COLUMN inv_financing_round.total_raised IS 'Total new money raised in this financing round (from CSV Total New Money field)';
