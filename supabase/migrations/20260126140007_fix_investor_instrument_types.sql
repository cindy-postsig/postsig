INSERT INTO public.investor_instrument_types (code, label, description)
VALUES
  ('SAFE', 'Simple Agreement for Future Equity', 'The industry standard (Y Combinator model). It is a contract, not debt. Keywords: "SAFE", "Purchase Amount" (no principal), "Liquidity Event", "Dissolution Event".'),
  ('CONVERTIBLE_NOTE', 'Convertible Promissory Note', 'A loan that turns into equity. It carries interest and a maturity date. Keywords: "Promissory Note", "Interest Rate" (e.g., 6%), "Maturity Date", "Principal".'),
  ('KISS', 'Keep It Simple Security', '500 Startups version of a SAFE. Comes in "Debt" and "Equity" flavors. Keywords: "KISS", "500 Startups", "MFN" (Most Favored Nation).'),
  ('CLA', 'Convertible Loan Agreement', 'Common in the UK/Europe. Similar to a Note but structured differently legally. Keywords: "Loan Agreement", "Tranches", "Qualifying Financing".'),
  ('WARRANT', 'Warrant', 'A right to buy shares at a fixed price later. Often attached to Venture Debt or Bridge Loans. Keywords: "Warrant Coverage", "Exercise Price", "Strike Price".'),
  ('BRIDGE_NOTE', 'Bridge Promissory Note', 'A specific type of convertible note used strictly to "bridge" a gap between two priced rounds. Keywords: "Bridge", "Next Equity Financing".')
ON CONFLICT (code) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description;
