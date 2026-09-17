-- Add remaining investor document types (IDs 21-39)
-- IDs 1-10 added in 20260109104730, IDs 11-20 added in 20260325120000

INSERT INTO "public"."document_types" ("id", "module_id", "code", "name", "description") VALUES
(21, 2, 'term_sheet',                       'Term Sheet',                        'Term sheets and summary of terms — valuation, instrument type, liquidation preference, anti-dilution, investor rights, and founder terms'),
(22, 2, 'cap_table',                        'Cap Table',                         'Capitalization tables — shareholder registry, share classes, option pool details, round history, and waterfall analysis at various exit scenarios'),
(23, 2, 'pitch_deck',                       'Pitch Deck',                        'Investor pitch decks and fundraising presentations — market sizing (TAM/SAM/SOM), traction metrics, fundraise details, team bios, and financial projections. All data is unaudited'),
(24, 2, 'due_diligence_package',            'Due Diligence Package',             'Due diligence packages and data room indexes — data room structure, financial data, material contracts, IP ownership, employee/equity details, and litigation/compliance status. Risk ratings are preliminary indicators only'),
(25, 2, 'venture_debt',                     'Venture Debt Agreement',            'Venture debt and loan/security agreements — facility structure, cost of capital (interest, fees, PIK), warrant coverage, financial and negative covenants, and prepayment mechanics'),
(26, 2, 'lpa',                              'Limited Partnership Agreement',     'Limited partnership agreements (fund formation) — management fee, carried interest, preferred return, capital calls, investment restrictions, key person provisions, governance, and distribution waterfall'),
(27, 2, 'indemnification_agreement',        'Indemnification Agreement',         NULL),
(28, 2, 'consent_and_waiver_agreement',     'Consent and Waiver Agreement',      NULL),
(29, 2, 'board_resolutions',                'Board Resolutions',                 NULL),
(30, 2, 'shareholder_resolutions',          'Shareholder Resolutions',           NULL),
(31, 2, 'employment_agreement',             'Employment Agreement',              NULL),
(32, 2, 'shareholder_written_consent',      'Shareholder Written Consent',       NULL),
(33, 2, 'compliance_certificate',           'Compliance Certificate',            NULL),
(34, 2, 'secretarys_certificate',           'Secretary''s Certificate',          NULL),
(35, 2, 'wire_transfer_instructions',       'Wire Transfer Instructions',        NULL),
(36, 2, 'founder_stock_restriction_agreement', 'Founder Stock Restriction Agreement', NULL),
(37, 2, 'disclosure_schedule',              'Disclosure Schedule',               NULL),
(38, 2, 'board_observer_agreement',         'Board Observer Agreement',          NULL),
(39, 2, 'management_rights_letter',         'Management Rights Letter',          NULL)
ON CONFLICT (module_id, code) DO NOTHING;

-- Reset sequence to match highest ID
SELECT setval(pg_get_serial_sequence('document_types', 'id'), 39);
