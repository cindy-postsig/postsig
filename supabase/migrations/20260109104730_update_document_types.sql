INSERT INTO "public"."document_types" ("id", "module_id", "code", "name", "description") VALUES
('1', '2', 'charter', 'Charter / Amended Charter', 'Certificate of Incorporation and amendments - contains cap table structure, authorized shares, liquidation preferences'),
('2', '2', 'ira', 'Investor Rights Agreement', 'Investor rights, information rights, registration rights, major investor thresholds'),
('3', '2', 'voting', 'Voting Agreement', 'Voting agreements, drag-along provisions, board composition'),
('4', '2', 'rofr_cosale', 'ROFR / Co-Sale', 'Right of first refusal and co-sale agreements'),
('5', '2', 'safe_note', 'SAFE / Notes', 'SAFEs and convertible notes - contains valuation cap, discount, conversion terms'),
('6', '2', 'side_letter', 'Side Letters', 'Side letter agreements with custom terms'),
('7', '2', 'amendment', 'Amendments', 'Document amendments and modifications'),
('8', '2', 'spa', 'Stock Purchase Agreement', 'Stock purchase agreements - pricing, shares, closing schedules'),
('9', '2', 'warrant', 'Warrant', 'Warrant documents - warrant shares, exercise terms')
ON CONFLICT (module_id, code) DO NOTHING;

