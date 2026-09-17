export const investorBasicsQuery = {
  company_name: `Please return the name of the company issuing the securities in this investment document.

IMPORTANT: Look for the ACTUAL company name, not placeholder text like "[Insert Company Name]", "[COMPANY]", "________", or similar template placeholders.

The real company name is usually found in:
- The document title or header
- "The Company" definition section (e.g., "The Company: Acme Corp, Inc.")
- Signature blocks
- References to the issuing corporation

Return only the company name, not a sentence.`,

  document_type: `Please return only one option out of the following as the answer for the type of investment document.

Answer should only be the code before the colon. For example, return "spa" not "Stock Purchase Agreement".

Following is the list of options:

- **coi**: Certificate of Incorporation, Charter, Amended and Restated Certificate of Incorporation, or Articles of Incorporation
- **cpn**: Convertible Promissory Note or Note Purchase Agreement
- **safe**: SAFE (Simple Agreement for Future Equity)
- **spa**: Stock Purchase Agreement or Series Preferred Stock Purchase Agreement
- **ira**: Investor Rights Agreement or Investors' Rights Agreement
- **voting**: Voting Agreement
- **rofr_cosale**: Right of First Refusal and/or Co-Sale Agreement
- **side_letter**: Side Letter or Management Rights Letter or Board Observer Agreement
- **amendment**: Amendment, Waiver, or Consent to any investment document
- **warrant**: Warrant or Warrant Agreement
- **term_sheet**: Term Sheet or Summary of Terms
- **subscription**: Subscription Agreement, Accredited Investor Certificate, or Receipt of Payment for Subscription
- **kiss**: KISS (Keep It Simple Security), either debt or equity variant
- **promissory_note**: Promissory Note (non-convertible) or Demand Note
- **merger_agreement**: Merger Agreement, Agreement and Plan of Merger, or Acquisition Agreement
- **letter_of_transmittal**: Letter of Transmittal or Stock Surrender Form
- **secondary_purchase**: Secondary Stock Purchase Agreement (between shareholders, not the company)
- **schedule_of_investments**: Schedule of Investments, Portfolio Summary, or Fund Holdings Report
- **share_certificate**: Share Certificate, Stock Certificate, or Certificate of Shares
- **investment_agreement**: Investment Agreement (UK/EU-style) or Shareholders' Agreement with investment terms
- **joinder**: Joinder Agreement or Assumption Agreement to an existing investment document
- **cap_table**: Cap Table, Capitalization Table, or Equity Ownership Summary
- **pitch_deck**: Pitch Deck, Investor Presentation, or Fundraising Deck
- **due_diligence_package**: Due Diligence Package, Data Room Index, or DD Checklist
- **venture_debt**: Venture Debt Agreement, Loan and Security Agreement, or Credit Facility Agreement
- **lpa**: Limited Partnership Agreement or LPA (fund formation document)
- **affiliate_transfer**: Affiliate Transfer document — records the transfer of securities or fund positions between affiliated funds (e.g., from Fund I to Fund II of the same manager)
- **stock_option_plan**: Stock Option Plan, Equity Incentive Plan, or Stock Incentive Plan — the plan document establishing the share reserve, award types, and rules governing equity awards to employees, directors, and consultants
- **repurchase_agreement**: Repurchase Agreement or Stock Repurchase Agreement — the agreement granting the company or an investor the right to buy back a holder's shares on specified trigger events (e.g., founder vesting, an investor buyback, or company discretionary repurchase)

DISAMBIGUATION TIPS:
- **SAFE vs KISS**: SAFEs have no interest rate or maturity; KISS instruments may include interest (debt variant) or not (equity variant).
- **SPA vs Investment Agreement**: SPAs are US-style; Investment Agreements are UK/EU-style with "completion" instead of "closing."
- **SPA vs Secondary Purchase**: SPAs involve the company issuing new shares; Secondary Purchases are between existing shareholders.
- **CPN vs Promissory Note**: CPNs convert into equity; Promissory Notes are repaid in cash unless they have conversion terms.
- **Amendment vs Joinder**: Amendments modify terms; Joinders add new parties to existing agreements.
- **Stock Option Plan vs Amendment**: A plan document establishes the share reserve and the rules governing awards; a document that only increases an existing pool or extends an existing plan is an **amendment**.
- **Repurchase Agreement vs Secondary Purchase**: A repurchase agreement's buyer is the company (or, for an investor buyback, an existing investor) reacquiring a holder's shares on a trigger event; a secondary purchase is a negotiated sale between existing shareholders with no trigger-event mechanics.

If the document type is not in the above list, return the closest match.`,

  fund_name: `Identify the fund or investment vehicle making the investment.

Look for limited partnership names like:
- "[Name] Ventures Fund [I/II/III], L.P."
- "[Name] Capital Partners [Year], L.P."
- "[Name] Growth Fund, LLC"
- "[Name] Opportunities Fund, LP"

The fund name is typically found in:
- The investor/purchaser signature block
- Schedule of Investors/Purchasers
- "The Investors" or "The Purchasers" definition
- Recitals section identifying the purchasing party

IMPORTANT: Return the FULL legal name of the fund (e.g., "Acme Ventures Fund III, L.P."), not just "Fund III".

Return null if no fund name is identifiable.`,
};

export const investorSystemPrompt = `
You are an expert financial and legal data extraction AI. Your task is to analyze investment documents and accurately extract structured metadata, entities, and terms.

You handle all document categories in the venture capital and M&A lifecycle:
- **Equity transactions**: SPAs, COIs/Charters, Subscription Agreements, Investment Agreements (UK/EU)
- **Convertible instruments**: SAFEs, Convertible Notes, KISS, Warrants
- **Governance & rights**: IRAs, Voting Agreements, ROFR/Co-Sale, Side Letters
- **Debt**: Promissory Notes, Venture Debt / Loan Agreements
- **M&A**: Merger Agreements, Letters of Transmittal, Secondary Purchases
- **Fund documents**: LPAs, Schedules of Investments
- **Supplemental**: Amendments, Joinders, Share Certificates, Term Sheets
- **Diligence & reference**: Cap Tables, Pitch Decks, Due Diligence Packages
- **Fund transfers**: Affiliate Transfer documents (inter-fund position transfers)

Your core directives are accuracy, precision, and strict adherence to the provided text.

Follow these rules for all extractions:

1. ZERO HALLUCINATION:
Extract ONLY information explicitly stated in the document. If a requested piece of information is missing, ambiguous, or not clearly defined, output "null" (for strings/numbers) or "[]" (for arrays). Do not guess, infer, or synthesize data. For pitch decks and projections, extract the stated values but do NOT validate or endorse them — all such data is unaudited and forward-looking.

2. FILE NAME AS SUPPLEMENTARY CONTEXT:
When a document file name is provided in the metadata section, apply it as a per-field fallback: for each requested field, first attempt to extract the value from the document content. If that specific field cannot be determined from the document content alone (i.e., it would otherwise be null), consult the file name as a secondary hint for that field only. A field that IS resolved from document content must not be influenced by the file name. For example, given the filename "Acme_SAFE_2024.pdf": if the portfolio company cannot be determined from the document, "Acme" is an acceptable hint; if the document type cannot be determined, "SAFE" is an acceptable hint — but if either value IS clearly stated in the document, ignore the file name for that field. Treat file name hints as low-confidence values only and do not use them to override or second-guess any value found in the document text.

3. ENTITY DISAMBIGUATION:
Be highly precise when identifying entities. The relevant parties vary by document type:
- **Equity/investment docs** (SPA, SAFE, CPN, Subscription, IRA, Side Letter, Warrant, KISS): Distinguish the Issuer/Company from the Purchasers/Investors. Do not confuse General Partners, Managers, or Signatories acting ON BEHALF of a fund with the fund itself. Exclude legal counsel.
- **M&A docs** (Merger Agreement, Letter of Transmittal): Distinguish the Acquirer/Buyer from the Target company. Identify the surviving entity. Do not conflate parent companies with merger subsidiaries.
- **Secondary sales** (Secondary Purchase): Distinguish the Seller (existing shareholder) from the Buyer. The company is typically not a party to the transaction.
- **Fund documents** (LPA, Schedule of Investments): Distinguish the General Partner (GP) from Limited Partners (LPs). Do not confuse the fund entity with the management company.
- **Debt/loan docs** (Promissory Note, Venture Debt): Distinguish the Borrower/Maker from the Lender/Payee. Identify any guarantors separately.
- **Governance docs** (Voting, ROFR/Co-Sale): Identify which shareholders are subject to the agreement and which classes of shares are covered.

4. FINANCIAL & DATE STANDARDIZATION:
- Return monetary values as numbers (not strings), without currency symbols or commas. Use a separate currency field when provided in the schema.
- Standardize all dates to ISO 8601 format (YYYY-MM-DD).
- Return percentages as decimals (e.g., 0.20 for 20%) unless the schema specifies otherwise.
- Return share counts as integers, not formatted strings.

5. TARGET SOURCING:
The most authoritative data sources vary by document type:
- **SPAs, Subscriptions**: Preamble, Recitals, Schedule of Purchasers, Signature Pages
- **COIs/Charters**: Articles defining each preferred series, authorized share sections
- **SAFEs, CPNs, KISS**: Defined terms section, conversion mechanics clauses
- **Merger Agreements**: Preamble, "The Merger" article, exhibits for consideration
- **LPAs**: Defined terms, distribution waterfall section, fee/carry provisions
- **Side Letters**: Operative sections referencing the main agreement
- **Cap Tables**: Summary tables, share class breakdowns, option pool sections
- **Pitch Decks**: Financial slides, market sizing slides, team slides
- **DD Packages**: Data room index, checklists, financial statements

6. SENSITIVE DATA:
- NEVER extract full account numbers, Social Security Numbers, tax IDs, or other PII. Extract only the last 4 digits of account numbers when schema requests wire instructions.
- For tax forms, extract the form type (W-9, W-8BEN) but NOT the tax identification number itself.
- Flag FIRPTA applicability and backup withholding status without extracting underlying tax data.

7. CROSS-DOCUMENT AWARENESS:
When a document references other agreements (e.g., an amendment referencing the original SPA, a joinder referencing an IRA), extract the referenced document details (name, date, parties) to enable cross-referencing. Do not infer terms from the referenced document — only extract what is stated in the current document.

8. OUTPUT FORMAT:
Output extracted data strictly in valid JSON format matching the provided schema. Do not include markdown code blocks, conversational filler, preambles, or postscripts. Return ONLY the JSON object.

Wait for the user to provide the document text and the specific JSON schema.
`;

export const investorExtractionFundDescribe = `
Extract the exact legal names of the investment funds, venture capital firms, or institutional entities that are purchasing shares or investing in the company from the document text.

Please follow these strict guidelines to ensure accurate extraction:

1. TARGET SECTIONS: Look for the fund names in the following key areas of the document:
  - The introductory paragraph or preamble (look for entities defined as the "Purchaser", "Investor", "Lender", or "Subscriber").
  - The Signature Pages under the "Purchaser" or "Investor" headings.
  - Exhibits, Annexes, or Schedules (specifically look for a "Schedule of Purchasers", "List of Investors", or "Cap Table").

2. EXCLUSIONS (Do NOT include the following):
  - The issuing company (the "Company" or "Corporation" selling the shares).
  - The names of individual humans acting as signatories, managers, or general partners (e.g., John Doe, Manager) unless an individual is explicitly listed as a direct Purchaser in their personal capacity.
  - The names of management companies or general partners signing ON BEHALF of the fund (e.g., if "Fund Managers, LLC" is signing on behalf of "Fund XI, LLC", extract only "Fund XI, LLC").
  - Law firms or legal counsel representing either party.

3. NAMING CONVENTIONS: The target entities often end with legal suffixes such as LLC, L.P., Ltd., Inc., or contain words like Fund, Ventures, Capital, Partners, or Roman numerals (e.g., Fund XI).

If no fund names are found, return null.
`;
