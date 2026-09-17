-- Migration: Create venture module document types
-- These are the initial document types supported for the investor/venture module

--------------------------------------------------------------------------------
-- 1. Insert venture document types (module_id = 2)
--------------------------------------------------------------------------------
INSERT INTO document_types (module_id, code, name, description) VALUES
(2, 'charter', 'Charter / Amended Charter', 'Certificate of Incorporation and amendments - contains cap table structure, authorized shares, liquidation preferences'),
(2, 'ira', 'Investor Rights Agreement', 'Investor rights, information rights, registration rights, major investor thresholds'),
(2, 'voting', 'Voting Agreement', 'Voting agreements, drag-along provisions, board composition'),
(2, 'rofr_cosale', 'ROFR / Co-Sale', 'Right of first refusal and co-sale agreements'),
(2, 'safe_note', 'SAFE / Notes', 'SAFEs and convertible notes - contains valuation cap, discount, conversion terms'),
(2, 'side_letter', 'Side Letters', 'Side letter agreements with custom terms'),
(2, 'amendment', 'Amendments', 'Document amendments and modifications')
ON CONFLICT (module_id, code) DO NOTHING;
