import { z } from 'zod';

export const commonSharesSchema = z
  .object({
    authorized_shares: z.number().nullable(),
    issued_and_outstanding_shares: z.number().nullable(),
    par_value: z.number().nullable(),
  })
  .nullable()
  .describe(
    `Extract the capitalization details specifically for **COMMON STOCK** from the provided Investment Agreement (typically a Stock Purchase Agreement).

### 1. SEARCH STRATEGY
*   **Primary Location:** Look for a section titled **"Capitalization"** (usually Section 2.2).
*   **Context:** The data usually describes the state of the company "immediately prior to the Initial Closing."

### 2. EXTRACTION RULES (Critical)
You must extract three distinct numbers. Do not confuse them.

1.  **Authorized Shares:** The total number of Common shares the company is *legally allowed* to issue according to its Certificate of Incorporation.
    *   *Look for:* "The authorized capital consists of [X] shares of Common Stock" or "Authorized to issue [X] shares."
    *   *Note:* This number is usually usually larger than the outstanding amount.

2.  **Issued & Outstanding:** The number of Common shares *actually owned* by shareholders (Founders, etc.) right now.
    *   *Look for:* "[Y] shares of which are issued and outstanding."
    *   *Exclusion:* Do NOT include shares reserved for the Option Plan or Preferred Stock conversion in this number. Only extract the number explicitly labeled as "issued and outstanding."

3.  **Par Value:** The nominal currency value per share.
    *   *Look for:* "$0.00001 par value" or similar.
`,
  );

export const optionPoolSchema = z
  .object({
    plan_name: z.string().nullable(),
    total_authorized_reserved: z.number().nullable(),
    outstanding_options: z.number().nullable(),
    available_for_grant: z.number().nullable(),
    effective_date: z.string().nullable(),
  })
  .nullable()
  .describe(
    `Extract the **Stock Plan / Employee Option Pool** details from the "Capitalization" section of the provided Stock Purchase Agreement.

### 1. SEARCH STRATEGY
*   **Location:** Look for Section 2.2 (Capitalization).
*   **Keywords:** Look for "Stock Plan", "Equity Incentive Plan", "Reserved", "Options", "Available for issuance".

### 2. EXTRACTION RULES
You must distinguish between three critical numbers that often appear close together:

1.  **Plan Name:** The specific name of the plan (e.g., "2020 Stock Plan").
2.  **Total Authorized (Reserved):** The total number of shares set aside for the plan.
    *   *Context:* Usually follows "reserved [X] shares... pursuant to the [Plan Name]."
3.  **Outstanding Options:** The number of options already granted to employees/advisors.
    *   *Context:* Usually follows "options to purchase [Y] shares have been granted."
4.  **Available for Grant:** The number of shares remaining in the pool.
    *   *Context:* Usually follows "[Z] shares... remain available for issuance."
5.  **Effective Date:** Extract the date specified in the Capitalization section text (e.g., "As of [Date]"). If no specific date is mentioned, default to the Agreement Date found in the document preamble.


*Note: In most contracts, (Outstanding + Available) should equal (Total Authorized).*`,
  );

export const preferredStockSchema = z
  .array(
    z.object({
      series_name: z.string().nullable(),
      original_issue_price: z.number().nullable(),
      par_value: z.number().nullable(),
      authorized_shares: z.number().nullable(),
      is_valuation_reference: z.boolean().nullable(),
      round_name: z.string().nullable(),
      is_current_transaction: z.boolean().nullable(),
    }),
  )
  .nullable()
  .describe(
    `Extract the definitions and economic terms for all **PREFERRED STOCK** series from the provided Stock Purchase Agreement.

### 1. SEARCH STRATEGY (Multi-Section)
You must correlate data from two specific sections:
*   **Section 1.1 (Sale and Issuance):** Contains the "series_name", "par_value", and "purchase_price" (Original Issue Price).
*   **Section 2.2 (Capitalization):** Contains the "authorized_shares" (often referred to as "Designated" shares) for each series.

### 2. EXTRACTION RULES
*   **Identify Sub-Series:** If the document divides Preferred Stock into sub-series (e.g., "Series Seed-1", "Series Seed-2"), create a separate entry for **EACH** sub-series. Do not group them.
*   **Price Extraction:** Extract the specific price per share for that sub-series.
*   **Count Extraction:** Extract the "Designated" or "Authorized" number of shares for that specific sub-series.
    *   *Note:* Do not simply extract the total Preferred count. We need the breakdown by Series.
*   **Valuation Logic (The "Headline" Flag):**
    *   Determine if this Series represents the **Primary/New Money Valuation**.
    *   Set is_valuation_reference: **TRUE** if this series has the **Highest Price** or is explicitly sold for **Cash** to new investors.
    *   Set is_valuation_reference: **FALSE** if this series appears to be a **Conversion** series (often indicated by a lower price, specific "Shadow" class naming like "-2", or defined in Section 1.4 regarding SAFEs).
*   **Round Name:**
    *   Look for the financing round label in Section 1 headings, recitals, or defined terms (e.g., "Series A Financing", "Seed Round").
    *   If a series is explicitly tied to a named round, use that label. Otherwise, infer from the series name (e.g., "Series A Preferred Stock" → "Series A").
    *   Return **null** if no round label can be determined.
*   **Current Transaction Flag:**
    *   Set is_current_transaction: **TRUE** if the series is being sold/issued in the current agreement (i.e., defined in **Section 1.1 "Sale and Issuance"**).
    *   Set is_current_transaction: **FALSE** if the series is historical/pre-existing and only referenced in the **Capitalization section (Section 2.2)** as already outstanding.
    *   This distinguishes new issuance from prior rounds listed for context.
    *   Return **null** if the document does not clearly establish whether the series is part of the current financing or only historical context.
`,
  );

export const closingsSchema = z
  .array(
    z.object({
      closing_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable()
        .describe(
          'Closing date in format YYYY-MM-DD (e.g., 2024-04-14). If no date is found, return null.',
        ),
      closing_label: z.string().nullable(),
      total_new_cash_raised: z.number().nullable(),
    }),
  )
  .nullable()
  .describe(
    `Extract all **Closing Events** (both Initial and Subsequent) from the provided Stock Purchase Agreement.

### 1. SEARCH STRATEGY
*   **Primary Source:** Look immediately at **Exhibit A / Schedule of Purchasers** (usually at the end of the file).
*   **Pattern Recognition:** Look for date-based headers separating lists of investors, such as:
    *   "Initial Closing: [Date]"
    *   "Subsequent Closing: [Date]"
    *   "2nd Closing", "Tranche 1", etc.
*   **Secondary Source:** If Exhibit A is empty or missing dates, check **Section 1.2 (Closing)** for the Initial Closing date.

### 2. EXTRACTION RULES
For **EACH** distinct closing date identified, extract:

1.  **Closing Date:** Format as YYYY-MM-DD.
2.  **Closing Label:** e.g., "Initial Closing" or "Subsequent Closing - April 16".
3.  **Total New Cash Raised:** The sum of the **Cash** purchase price for that specific date.
    *   *Critical:* Do NOT include "Conversion of SAFEs/Notes" in this number. We strictly want the **New Cash** coming into the bank account.
    *   *Logic:* Use the "Total" row at the bottom of the block for that date if it exists.
4.  **Currency:** ISO code (e.g., USD).

### 3. OUTPUT FORMAT
Return the result as a raw JSON **Array**.

[
  {
    "closing_date": "YYYY-MM-DD",
    "closing_label": "string",          // e.g., "Initial Closing"
    "total_new_cash_raised": number,    // e.g., 2569999.90
    "currency": "string"
  }
]`,
  );

export const closingParticipantsSchema = z
  .array(
    z.object({
      investor_name: z.string().nullable(),
      closing_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
      security_name: z.string().nullable(),
      shares_purchased: z.number().nullable(),
      total_consideration: z.number().nullable(),
      transaction_type: z.enum(['NEW_CASH', 'CONVERSION']).nullable(),
      currency: z.string().nullable(),
    }),
  )
  .nullable()
  .describe(
    `Extract detailed transaction records the **"Schedule of Purchasers"** (Exhibit A) of the provided Investment Document.

### 1. TABLE ANALYSIS STRATEGY
The structure of Schedule A varies by deal. You must dynamically analyze the column headers to understand the data model.
*   **Step 1 (Identify Securities):** Look for columns that represent share counts. They often contain keywords like "Shares", "Units", or specific series names (e.g., "Series A Shares", "Series Seed-1").
*   **Step 2 (Identify Consideration):** Look for columns that represent value/money. They often contain keywords like "Purchase Price", "Amount", "Consideration", "Cash", or "Conversion".
*   **Step 3 (Identify Closings):** Look for row delimiters or section headers that indicate different dates (e.g., "Initial Closing", "Second Tranche").

### 2. EXTRACTION & UNPIVOT LOGIC
Iterate through every investor row. If an investor holds multiple types of securities (i.e., values exist in multiple share columns), create a **SEPARATE** JSON object for each security type.

**For each entry, extract:**
1.  **investor_name**: The full legal name of the entity.
2.  **closing_date**: The date associated with that specific row/section. If no specific date is listed in the Schedule, use the "Effective Date" of the main agreement.
3.  **security_name**: The specific class of stock found in the **Column Header** for the share count.
    *   *Example:* If the column is "Series A Shares", the security_name is "Series A Preferred Stock".
    *   *Example:* If the column is just "Shares", look at the Agreement definitions to determine the class.
4.  **shares_purchased**: The numeric count. Ignore "---", "0", or blank.
5.  **total_consideration**: The monetary amount paid.
6.  **transaction_type**: Determine if this is New Cash or a Conversion.
    *   **Logic:** Look at the column header for the price.
    *   If header says "Cash", "Investment Amount", or "Purchase Price" -> **'NEW_CASH'**.
    *   If header says "Conversion", "Cancellation of Note", "Indebtedness", or "SAFE" -> **'CONVERSION'**.
    *   *Default:* If ambiguous, default to **'NEW_CASH'**.

### 3. HANDLING AGGREGATE PRICES
*   **Scenario:** One "Total Purchase Price" column covers multiple Share Class columns.
*   **Action:** If the document does not explicitly break down the price per class, use the "Price Per Share" (found in the main text of the agreement) to calculate the consideration for each class, OR assign the total price to the primary share class and 0 to the secondary (if it's a bonus/warrant situation). *Prioritize explicit data over calculation.*
`,
  );

export const boardRepresentativesSchema = z
  .array(
    z.object({
      director_name: z.string().nullable(),
      designator_description: z.string().nullable(),
      seat_type: z
        .enum(['INVESTOR', 'COMMON', 'INDEPENDENT', 'CEO'])
        .nullable(),
    }),
  )
  .nullable()
  .describe(
    `Extract **Board of Directors** governance details from the provided Venture Capital documents.

### 1. SEARCH STRATEGY
*   **Stock Purchase Agreement (SPA):** Look for Section 4 or 5 ("Conditions to Closing") under a header like "Board of Directors" or "Management."
*   **Voting Agreement (VA):** If available, look for Section 1 ("Board Composition").
*   **Exhibits:** Sometimes the initial board members are listed in a "Management Rights Letter" or an Exhibit.

### 2. EXTRACTION LOGIC
You must identify the **Human Director** and the **Source of Power** (who appointed them).

**For each Board Seat identified, extract:**

1.  **Director Name:** The name of the natural person currently serving or appointed at closing.
    *   *Note:* If the seat is vacant or described generically (e.g., "One person nominated by Series A"), set name to null.
2.  **Designator (The "Appointing Power"):** Who has the right to elect this seat?
    *   *Specific Investor:* e.g., "Designated by Radical Ventures."
    *   *Share Class:* e.g., "Designated by holders of Series Seed Preferred Stock."
    *   *Founders/Common:* e.g., "Designated by the Key Holders" or "Common Stock."
    *   *Independent:* e.g., "Mutually agreed upon by the other directors."
3.  **Seat Type:** Classify the seat using one of these values:
    *   INVESTOR (Appointed by Preferred Stock or specific VC).
    *   COMMON (Appointed by Founders or Common Stock).
    *   INDEPENDENT (Appointed by mutual consent, usually an industry expert).
    *   CEO (Seat held ex-officio by the CEO).

### 3. EXCLUSIONS
*   **Observers:** Do NOT extract "Board Observers" or "Information Rights holders." Only extract voting Directors.
*   **Officers:** Do not extract "Officers" (VP, Treasurer) unless they are explicitly named as Directors on the Board.`,
  );

export const currentPricePerShareSchema = z
  .array(
    z.object({
      security_name: z.string().nullable(),
      price_per_share: z.number().nullable(),
      currency: z.string().nullable(),
      effective_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .nullable(),
    }),
  )
  .nullable()
  .describe(
    `Your task is to extract the **Current Purchase Price Per Share** for the securities being sold in the provided Stock Purchase Agreement.

### 1. SEARCH STRATEGY
*   **Primary Location:** Look at **Section 1** (usually titled "Purchase and Sale" or "Authorization and Sale").
*   **Specific Clause:** Look for Section 1.1 or 1.2. The sentence usually follows this pattern:
    *   *"...agrees to sell [Series Name] at a purchase price of $[Price] per share..."*

### 2. EXTRACTION RULES
1.  **Multiple Series:** The document may contain multiple sub-series (e.g., "Series Seed-1" and "Series Seed-2") with **different prices**. You must extract a separate record for EACH specific sub-series found.
2.  **Price vs. Par Value (CRITICAL):**
    *   **Target:** Extract the **"Purchase Price"** or **"Original Issue Price"** (e.g., $0.3337). This is the actual amount investors pay.
    *   **Ignore:** Do NOT extract the **"Par Value"** (e.g., $0.00001 or $0.001). This is a nominal legal figure and is NOT the price.
3.  **Precision:** Maintain the exact decimal precision found in the text (e.g., if it says 0.3337, do not round to 0.33).

### 3. OUTPUT FORMAT
Return the result as a raw JSON **Array** (one object per share class found).

[
  {
    "security_name": "string",       // e.g., "Series Seed-1 Preferred Stock"
    "price_per_share": number,       // e.g., 0.3337
    "currency": "string",            // e.g., "USD"
    "effective_date": "YYYY-MM-DD",  // Date of the Agreement
  }
]`,
  );

// Function-based schema (uses investorNames parameter)
export const investorPartiesSchema = (
  investorNames: string[] | null,
  investorFunds: string[] | null,
) =>
  z
    .array(
      z.object({
        name: z.string().describe('The name of the investor party.'),
        type: z.string().describe('The type of the investor party.'),
        is_self: z
          .boolean()
          .describe(
            'Whether the investor party is self-representing the organization itself.',
          ),
      }),
    )
    .nullable()
    .describe(
      `
        Extract all "Investor Parties" from the provided text.

        ### 1. SEARCH STRATEGY
        Do not limit your search to one section. You must look in the following priority order to find the most accurate legal names:
        1.  **"Schedule of Purchasers"** (often Exhibit A or Schedule A).
        2.  **"Signature Pages"** (specifically the "Purchaser" or "Investor" signature blocks).
        3.  **The Preamble** (the first paragraph defining the parties).

        ### 2. EXTRACTION RULES
        *   **Legal Name:** Extract the full legal name of the entity (e.g., "Radical Ventures Fund II, L.P." rather than just "Radical Ventures").
        *   **Signatories vs. Entities:** If a person is signing on behalf of a fund (e.g., "John Doe, Partner at VC Fund"), extract "VC Fund" as the party, not "John Doe." Only extract "John Doe" if he is investing his own personal capital.
        *   **Grouping:** If an investor invests through multiple entities (e.g., "Fund II, L.P." and "Fund II (International), L.P."), treat them as distinct entries.

        ### 3. TYPE CLASSIFICATION
        Assign the most specific type from the list below based on the entity structure and context:
        *   **Fund:** Venture capital funds, private equity funds, or entities ending in "L.P.", "GP", or "Partners".
        *   **Trust:** Any entity containing the word "Trust" (e.g., "The Smith Revocable Trust").
        *   **Company:** Corporations or LLCs that are operating companies (not investment vehicles).
        *   **Individual Investor:** A natural person investing directly.
        *   **Other:** If the entity does not fit the above.

        ### 4. "IS_SELF" MATCHING LOGIC
        You are provided with a list of target names below:
        Target names (JSON array):
        ${JSON.stringify(investorNames ?? [], null, 2)} and fund(s): ${JSON.stringify(investorFunds ?? [], null, 2)}
        *   Compare every extracted Investor Party against this list.
        *   Set \`is_self\` to **true** if there is a match.
        *   **Fuzzy Matching Rules:** Match if the target name is a substring, a widely used abbreviation, or a parent organization of the legal name in the document (e.g., if target is "Sequoia", match true for "Sequoia Capital Fund IV, L.P.").

        ### 5. OUTPUT FORMAT
        Return the result as a raw JSON array (no markdown formatting). If no investors are found, return \`null\`.

        JSON Schema:
        [
          {
            "name": "string",
            "type": "string",
            "is_self": boolean,
          }
        ]
          `,
    );

// ---------------------------------------------------------------------------
// Universal investor-basics fields (apply to all document types)
// Keys match master_field_definitions: company_name, fund_name,
// investor_extraction_fund_describe
// ---------------------------------------------------------------------------

export const companyNameSchema = z
  .string()
  .nullable()
  .describe(
    "From this document, extract the ACTUAL legal name of the issuing company as it appears on the title page, preamble, or first recital paragraph. Do NOT return template placeholders (e.g. '[Company Name]'). Return only the company name string, not a full sentence. If not found, return null.",
  );

export const fundNameSchema = (
  investorFundNames: string[] | null,
  organizationName: string | null = null,
) =>
  z
    .array(z.string())
    .nullable()
    .describe(
      `Extract ONLY the names of the actual investing fund vehicles from this document that belongs to the organization "${organizationName}".

        Organization context: "${organizationName}".
        Use this organization name only to decide whether a fund likely belongs to that organization. Do NOT return the organization name by itself
  unless the document explicitly shows that exact name as the legal investing entity and it is clearly the purchaser/investor.

        Prioritize these sections:
        - Preamble / introductory paragraph
        - Definitions of Purchaser / Investor / Subscriber / Lender
        - Signature blocks
        - Schedule of Purchasers / Investors / Subscribers
        - Exhibits, annexes, or cap tables listing investing entities

        Exclude:
        - The organization or VC firm brand name by itself when the document names a more specific fund vehicle
        - The issuing company
        - Individual signatories
        - General partners, managers, or management companies signing on behalf of a fund
        - Law firms or counsel

        Critical disambiguation:
        - If the document says something like "Acme Ventures Management, LLC, as manager of Acme Ventures Fund III, L.P.", return only "Acme Ventures Fund III, L.P.".
        - If both "${organizationName}" and a specific fund vehicle are mentioned, return the specific fund vehicle, not "${organizationName}".
        - If the document mentions only the organization name and does NOT clearly identify a separate investing fund vehicle, return null.

        Known fund names for this organization (JSON array):
        ${JSON.stringify(investorFundNames ?? [], null, 2)}

        MATCHING REQUIREMENT (this determines what you return):
        - A fund vehicle extracted from the document qualifies ONLY IF it matches one of the Known fund names above under the fuzzy rules below.
        - Discard any fund found in the document that does not match a known fund name. Do not return funds that are absent from the Known fund names list.
        - For every qualifying fund, return the KNOWN fund name in its exact canonical form as written in the list above — NOT the text as it appears in the document.
          (Example: list has "Acme Fund III, L.P." and the document writes "Acme Fund 3 LP" — return "Acme Fund III, L.P.", the list version.)
        - If the Known fund names list is empty, return null. (By design: with no known funds to match against, no document fund can qualify, so extraction returns null rather than guessing.)

        Fuzzy matching rules (used ONLY to decide whether a document fund equals a known fund):
        - Consider abbreviations
        - Ignore missing or different legal suffixes (L.P., LP, LLC, Ltd., Inc.)
        - Treat Roman and Arabic numerals as equivalent (Fund III = Fund 3)
        - Ignore minor whitespace or punctuation differences

        Return a JSON array of the distinct matched canonical known fund names. Return null if no document fund matches any known fund name.
      `,
    );

export const investorExtractionFundDescribeSchema = z
  .array(z.string())
  .nullable()
  .describe(
    'From this document, extract the exact legal names of all investment funds, limited partnerships, and institutional entities that are purchasing shares or investing. Look in introductory paragraphs, under Purchaser/Investor headings, in Exhibits/Annexes, and in signature blocks. EXCLUDE: the issuing company, individual signatories, management companies, and law firms. INCLUDE: entities ending in LLC / L.P. / Ltd. or containing Fund / Ventures / Capital / Partners. If none are found, return null.',
  );
