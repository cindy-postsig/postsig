-- Add new investor document types
-- Existing types (IDs 1–10) are unchanged:
--   1  charter           Charter / Amended Charter
--   2  ira               Investor Rights Agreement
--   3  voting            Voting Agreement
--   4  rofr_cosale       ROFR / Co-Sale
--   5  safe              SAFE
--   6  side_letter       Side Letter
--   7  amendment         Amendments
--   8  spa               Stock Purchase Agreement
--   9  warrant           Warrant
--  10  cpn               Convertible Promissory Note

INSERT INTO "public"."document_types" ("id", "module_id", "code", "name", "description") VALUES
(11, 2, 'subscription',          'Subscription Agreement',        'Investor subscription agreements — investor details, securities purchased, accreditation representations, and closing mechanics'),
(12, 2, 'kiss',                  'KISS',                          'Keep It Simple Security (500 Startups form). Comes in Debt and Equity variants — valuation cap, discount rate, conversion triggers, and optional MFN clause'),
(13, 2, 'promissory_note',       'Promissory Note',               'Standalone promissory notes — principal, interest rate, maturity, repayment structure, security/collateral, and events of default'),
(14, 2, 'merger_agreement',      'Merger Agreement',              'Merger and acquisition agreements — transaction structure, consideration, closing conditions, equity award treatment, indemnification, and employee matters'),
(15, 2, 'letter_of_transmittal', 'Letter of Transmittal',         'Letter of transmittal for merger/acquisition closings — shareholder identity, tax details, shares surrendered, consideration election, and required certifications'),
(16, 2, 'secondary_purchase',    'Secondary Purchase Agreement',  'Secondary share purchase agreements — seller/buyer details, price per share, ROFR waiver documentation, and post-closing transfer mechanics'),
(17, 2, 'schedule_of_investments','Schedule of Investments',      'Fund schedule of investments — portfolio positions, cost basis, fair value, unrealized gain/loss, and valuation methodology by ASC 820 / IFRS 13 level'),
(18, 2, 'share_certificate',     'Share Certificate',             'Share certificates — certificate number, issue date, share class, legends, and cross-reference to cap table'),
(19, 2, 'investment_agreement',  'Investment Agreement',          'UK/EU format investment agreements — subscription terms, warranties, disclosure letter, governance provisions, reserved matters, and investor protections'),
(20, 2, 'joinder',               'Joinder Agreement',             'Joinder agreements — joining party details, underlying agreement, scope of obligations assumed, triggering context, and execution verification')
ON CONFLICT (module_id, code) DO NOTHING;
