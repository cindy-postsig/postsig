import productsListQuery from './productsListQuery';
import { SchemaType } from '@google/generative-ai';

export const otherQueries = [
  {
    dbName: 'subscription_term',
    query: `
      Analyze the provided agreement document, focusing on sections related to "Term," "Subscription Term," and "Renewal."

      Identify the standard **duration** or **length** of the initial and/or renewal **subscription term** (or subscription period) as specified within the main body of the agreement. Look for phrases like:
      *   "initial term of X months/years"
      *   "renew for successive X-month/X-year periods"
      *   "the subscription term shall be X months/years"

      Note: The specific duration for the very first term might be defined solely in an Order or SOW, but often a standard duration (especially for renewals, or sometimes a default initial duration) is mentioned in the main agreement text. Focus on extracting that standard duration mentioned in the main body.

      If the duration is specified in **years**, convert it to **months** for the final output (e.g., 1 year = 12 months, 2 years = 24 months).

      Extract **only the final numerical value** representing the term length in **months**.

      For example:
      *   If the text says "renew for successive **12-month** periods", extract \`12\`.
      *   If the text says "initial term of **one year**", extract \`12\`.
      *   If the text says "term length shall be **2 years**", extract \`24\`.
      *   If the text says "a **six (6) month** term", extract \`6\`.
      `,
  },
  {
    dbName: 'billing_frequency',
    query: `
      What is the billing frequency? Please return a single value from the following list. If none of the options match, please return the billing frequency you identify.
      Following is the list of options.
         - Monthly
         - Quarterly
         - Annually
         - Bi-Annually
      `,
  },
  {
    dbName: 'payment_terms',
    query: `
      Analyze the provided agreement document. Identify and extract the specific clause(s) detailing the **payment terms** for fees and expenses owed by the Customer/Licensee to the Provider/Vendor.

      Focus primarily on locating the terms that specify:
      1.  **When payment is due** relative to an invoice date or other trigger (e.g., "due within 30 days", "Net 60", "upon receipt of invoice"). This is often considered the core payment term.
      2.  Where the specific **fee amounts** or charges are formally defined or referenced (e.g., "as described in the Order", "per the attached price list", "Fees are set forth in Exhibit A").

      Also, if presented together with the primary terms above, include key related details such as:
      *   The required **currency** for payment (e.g., "payments shall be made in US dollars").
      *   Consequences or penalties for **late payments** (e.g., "subject to an interest charge of X% per month").

      Look in sections commonly titled "Payment Terms," "Fees," "Charges," "Invoicing," "Commercial Terms," or similar financial sections.

      Extract the core sentence(s) covering these points, prioritizing the payment **due date/timing** and **reference to fee amounts**. Include section references (e.g., Section 10.2) if readily available.
    `,
  },
  {
    dbName: 'data_disposal_tnc',
    query: `
      Analyze the provided agreement document. Identify and extract the specific clause(s) detailing the terms and conditions ("tnc") for **data disposal, deletion, retention, and/or return** of **Customer Data** (or licensee data, etc.) upon or following the **termination or expiration** of the agreement or relevant subscription term.

      Look for information addressing points such as:
      *   The **time period**, if any, during which the Customer/Licensee can **export or retrieve** their data after termination/expiration.
      *   The Provider's/Vendor's **obligation (or lack thereof) to retain** the Customer/Licensee data after termination/expiration.
      *   The **timeframe or conditions** under which the Provider/Vendor **will or may delete/destroy** the Customer/Licensee data (e.g., "after X days", "upon request", "at vendor's discretion after X period").
      *   Any specific procedures mentioned for requesting data return or deletion.
      *   Mention of exceptions, such as data retained in backups, for archival purposes, or for legal/regulatory compliance.

      Search in sections commonly titled "Term and Termination," "Effect of Termination," "Data Handling upon Termination," "Data Retention," "Confidentiality," "Data Security," or similar clauses discussing post-agreement obligations related to data.

      Extract the full text of the relevant clause(s) covering these data disposal/retention aspects following contract end. Include section references (e.g., Section 12.3) if readily available.
    
    `,
  },
  {
    dbName: 'audit_requirements',
    query: `
      Analyze the provided agreement document. Identify and extract any specific clause(s) that grant either party (**Customer/Licensee** or **Provider/Vendor**) the **right to audit** the other party or its records related to the agreement.

      Look for terms related to:
      *   **Audit**, **inspection**, **review**, **verification**, **examination** of records, systems, facilities, or compliance.
      *   Access to **records, logs, books, systems, or facilities** specifically for audit purposes.

      Specify, if mentioned within the extracted clause(s):
      *   **Who** has the right to audit whom? (e.g., Customer audits Provider, Provider audits Customer)
      *   The **scope** or **purpose** of the audit (e.g., compliance with the agreement's terms, data security standards/practices, usage limitations, fee calculations, intellectual property usage).
      *   Any stated **procedures** or conditions (e.g., required notice period, frequency limitations like 'once per year', location of audit, requirements for using independent third-party auditors, confidentiality of findings).
      *   Allocation of audit **costs**.

      Search in sections commonly titled "Audit Rights," "Compliance," "Verification," "Security," "Fees," "Record Keeping," "Usage Verification," or within general governance or miscellaneous clauses.

      Extract the full text of the relevant clause(s) granting and describing these audit rights. If no specific clause granting audit rights to either party is found in the document, please state that clearly.
    `,
  },
  {
    dbName: 'annual_increase',
    query: `
      What is the annual increase percentage? Should be in the format of value%
      `,
  },
  {
    dbName: 'discount',
    query: `
      What is the discount percentage? Should be in the format of value%
      `,
  },
  {
    dbName: 'currency',
    query: `
      What is the currency used in this contract? This can be found out from prices or money values. Please return a single value from the following list.
      If none of the options match, please return the three letter currency code you determine.
      Following is the list of some possible options.
         - USD
         - EUR
         - Japanese Yen
         - British Pound
         - Swiss Franc
         - Canadian Dollar
         - Australian/NZ Dollar
      `,
  },
  {
    dbName: 'cancellation_process',
    query: `
      Analyze the provided agreement document, focusing on sections related to "Term," "Subscription Term," "Renewal," and "Termination."

      Identify and extract the specific clause(s) that describe the process for preventing automatic renewal or for terminating the agreement without cause effective at the end of the current term (or subscription term).

      Look for sentences explaining elements like:

      * Whether the contract renews automatically by default.
      * The requirement for either party to provide notice (e.g., "notice of non-renewal," "notice of termination").
      * The specific deadline or advance notice period required for this notice, typically specified in days before the end of the current term (e.g., "at least X days before term ends," "X days prior to expiration").
      * Important: Focus specifically on the standard mechanism for ending the agreement relationship at the end of a term through notice. Exclude descriptions of termination for cause (e.g., due to breach of contract, bankruptcy) or any associated cure periods.

      Extract the full, complete sentence(s) describing this standard non-renewal or end-of-term cancellation process. Include section references (e.g., Section 10.1) if readily available.
    `,
  },
  {
    dbName: 'distribution_rights',
    query: `
      Analyze the provided data provider agreement document. Identify and extract the specific clause(s) that detail the customer's restrictions related to distribution rights.
 
      Look for text covering limitations such as:
        *   Selling, reselling, or sublicensing the data, content, or service.
        *   Distributing, sharing, broadcasting, or providing access to the data, content, or service to third parties (note any exceptions like affiliates if specified).
        *   Using the data or service on behalf of, or for the primary benefit of, third parties.
        *   Prohibitions on incorporating the data into products/services offered to third parties.

      Focus on the contractual language that limits how the customer can disseminate or leverage the provider's data/service externally or for others.

      Please extract the full text of the relevant clause(s), including the section number(s) if available. If these restrictions are spread across multiple sentences or sub-sections within a larger clause (like 'Restrictions' or 'License Grant'), extract the relevant portions governing these specific distribution limitations.
    `,
  },
  {
    dbName: 'end_users',
    query: `Find and list all clauses in this contract that describe or define "end users," including any limitations or restrictions on who qualifies as an end user.`,
  },
  {
    dbName: 'number_of_users',
    query:
      'What is the total number of users or licences allocated for each product, including any relevant user groups, departments, job functions, or user locations if specified.',
  },
  {
    dbName: 'market_data_types',
    query: `
      Analyze the provided data provider agreement document. Locate and extract the section(s) or sentence(s) that provide a high-level, often introductory or summary description of the Vendor's primary service, platform, or solution being offered under the agreement.

      This description is typically found in early sections like "Overview," "Background," "Introduction," "Recitals," or the initial part of a "Services" definition/section. It often summarizes the core function, value proposition, or key technology used (e.g., "a platform for X," "an AI-powered tool for Y," "provides market data feeds for Z").

      Extract the full text of this descriptive summary statement(s). Avoid extracting detailed technical specifications, limitations, or the formal license grant itself, focusing instead on the text that explains *what the service is* at a summary level.

      At the end, describe every product or service that is being offered in the contract in few words.
    `,
  },
  {
    dbName: 'internal_external_users',
    query: `Is this contract for internal or external users?`,
  },
  {
    dbName: 'derivative_works',
    query: `
      Analyze the provided data provider agreement document. Identify and extract the specific clause(s) that detail restrictions related to the creation of derivative works and reverse engineering of the provider's service, software, or data.

      Look for text covering limitations such as:
        *   Prohibitions on **modifying, adapting, translating, or creating derivative works** based on the provider's materials (service, software, data, content, etc.).
        *   Restrictions on **reverse engineering, decompiling, disassembling** the software or service.
        *   Limitations on **accessing or attempting to access source code or non-public APIs**.
        *   Restrictions on **copying elements** of the service or software (often mentioned alongside derivative works).

      Focus on the contractual language that protects the provider's intellectual property by preventing the customer from altering, deriving new works from, or discovering the underlying structure/code of the provider's offering.

      Please extract the full text of the relevant clause(s), including the section number(s) if available. If these types of restrictions are grouped together within a larger section (e.g., 'Restrictions', 'Intellectual Property', 'License Grant'), extract the pertinent sentences or sub-clauses covering these specific points.

      At the end, describe every item in few concise words.
    `,
  },
  {
    dbName: 'activities',
    query: `
      Analyze the provided agreement document. Identify and extract the specific clause or phrase that defines the **primary permitted scope, purpose, or type of activity** for which the **Customer** (or Licensee, Client, etc.) is authorized to use the Provider's service, data, software, or platform.

      Look for affirmative statements defining the **intended use**, often found near the beginning of the rights/restrictions sections, or in sections titled:
      *   "Permitted Use"
      *   "License Grant"
      *   "Scope of License" / "Scope of Use"
      *   "Authorized Use" / "Use Rights"

      The target text often describes the fundamental nature of the allowed usage at a high level. Examples of the type of phrase to extract include:
      *   "for Customer's internal business purposes"
      *   "for non-commercial research purposes only"
      *   "solely for the purpose of [specific task described in brief]"
      *   "in accordance with the Documentation for its own operational use"

      Extract the core phrase or sentence that defines this primary authorized scope or purpose. Avoid extracting detailed lists of specific features/functions or long lists of *prohibited* activities/restrictions. Focus on the high-level definition of the **allowed** activity or purpose. Include section references if readily available.
    `,
  },
  {
    dbName: 'geo_restrictions',
    query: `What are the geographic restrictions? Ex: Global, North America, Americas, Asia, prohibitions against doing business with sanctioned countries, etc.`,
  },
  {
    dbName: 'exclusivity_terms',
    query: `
      Is this contract exclusive or non-exclusive? Please return a single value from the following list.
         - Exclusive
         - Non-exclusive
      `,
  },
  {
    dbName: 'marketing_rights',
    query: `
    Your task is to meticulously extract all clauses and information pertaining to marketing rights granted within the provided data provider contract.

**Instructions:**

1.  **Identify and extract all clauses that define the scope, limitations, and conditions of marketing rights granted to [Recipient of Data/Company Name - try to infer this from the document if not explicitly stated, otherwise state 'the recipient of the data'].** This includes, but is not limited to:
    *   **Permitted uses of the data for marketing purposes:** Be specific about the types of marketing activities allowed (e.g., email marketing, targeted advertising, content marketing, social media campaigns, etc.). Extract any limitations on the channels or platforms that can be used.
    *   **Prohibited uses of the data for marketing purposes:** Identify any activities that are explicitly forbidden (e.g., reselling the data, using the data for discriminatory targeting, etc.).
    *   **Data Usage Restrictions:** Are there restrictions on combining the data with other datasets for marketing purposes? Are there any limitations on the types of individuals that can be targeted? Are there rules around anonymization/pseudonymization for marketing use?
    *   **Attribution and Disclaimers:** Are there any requirements for attribution or disclaimers when using the data in marketing materials?  Extract the exact wording required, if any.
    *   **Duration of Rights:** What is the duration of the granted marketing rights? When does the right to use the data for marketing expire? Are there renewal clauses related to marketing rights?
    *   **Geographic Restrictions:** Are there any geographic limitations on where the data can be used for marketing purposes?
    *   **Volume Restrictions:** Is there a limit to how much data can be used for marketing purposes (e.g., number of contacts, number of API calls, etc.)?
    *   **Data Updates/Refresh Requirements:** Are there specific requirements or timelines for updating or refreshing the data used for marketing?
    *   **Compliance and Legal Obligations:** What compliance obligations (e.g., GDPR, CCPA, CAN-SPAM) are placed on the recipient regarding the use of the data for marketing?
    *   **Data Security Requirements Related to Marketing Use:** Are there specific security measures required when using the data for marketing to protect its confidentiality and integrity? (e.g., encryption, access controls).
    *   **Audit Rights:** Does the data provider have the right to audit the recipient's use of the data for marketing purposes?
    *   **Termination Rights Related to Marketing Use:** Under what circumstances can the data provider terminate the recipient's right to use the data for marketing?
    *   **Liability and Indemnification:** Who is liable if the data is used improperly for marketing? What are the indemnification obligations?
    *   **Data Quality Guarantee Related to Marketing Use:** Is there any guarantee related to data quality for marketing purposes?

2.  **For each extracted clause, provide the following information in a structured format (e.g., JSON, Markdown table):**

    *   **Clause Text:** The exact text of the clause.
    *   **Clause Type:** (e.g., Permitted Use, Prohibited Use, Attribution, Duration, Geographic Restriction, Compliance, etc.) Choose the most appropriate classification.
    *   **Summary:** A concise (1-2 sentence) summary of the clause's meaning and impact.
    *   **Page Number/Section:** Identify the page number or section of the contract where the clause can be found.

3. **If a section refers to another document that further defines marketing rights, summarize this reference and if possible find and include that reference. If not specify which document to search.**

4. **Pay close attention to ambiguous language or clauses that could be interpreted in multiple ways. Highlight these ambiguities and explain the potential interpretations.**

5. **Output the extracted information in a well-organized and easy-to-read format.** Consider using a table format (e.g., Markdown table) or JSON to structure the data.

**Important Considerations:**

*   Assume the user has limited legal knowledge. Your summaries should be clear and understandable to a non-lawyer.
*   Prioritize completeness and accuracy. It is better to include potentially irrelevant clauses than to miss important ones.
*   Maintain objectivity. Do not offer legal opinions or advice. Simply extract and summarize the relevant clauses.
*   If you can not find any marketing rights clauses, please return null

    `,
  },
  {
    dbName: 'renewal_period',
    query: `
      Analyze the provided agreement document, focusing on sections related to "Term," "Subscription Term," and particularly "Renewal."

      Identify the standard **duration** or **length** specified for **renewal periods** or **successive subscription terms** that occur after the initial term. Look for phrases like:
      *   "renew for successive X-month/X-year periods"
      *   "each renewal term shall be X months/years"
      *   "automatically renew for additional periods of X months/years"

      Focus specifically on the length defined for the terms *after* the initial one. If the initial term length is stated separately and is different, ignore it for this request.

      If the duration is specified in **years**, convert it to **months** for the final output (e.g., 1 year = 12 months, 2 years = 24 months).

      Extract **only the final numerical value** representing the renewal term length in **months**.

      For example:
      *   If the text says "renew for successive **12-month** periods", extract \`12\`.
      *   If the text says "renewal terms of **one year**", extract \`12\`.
      *   If the text says "additional periods of **2 years**", extract \`24\`.
      *   If it says "a **six (6) month** renewal term", extract \`6\`.
    `,
  },
  {
    dbName: 'suspension_of_service',
    query: `What are the suspension of service terms?`,
  },
  {
    dbName: 'auto_renewal',
    query: `
      What renewal type does this contract have? Please return a single value from the following list. If none of the options match, please return the renewal type you determine.
      If you can not identify the renewal type, please return the word 'Other'. Following is the list of options.
         - Auto renewal
         - Manual
         - One-time
      `,
  },
  {
    dbName: 'multi_year',
    query: `Please briefly provide information whether the contract is a multi year agreement or not. Return only the word 'Yes' or 'No'.`,
  },
  {
    dbName: 'tos_urls',
    query:
      'Please extract all any Terms of Serice URLs in this document. Data type of response: String Array.',
  },
  {
    dbName: 'trying_to_update_another_doc',
    query: `Is this contract attempting to update another contract, or is it related to another contract? Please return the answer as either 'Yes' or 'No'. Data type of response should be Boolean`,
  },
  {
    dbName: 'all_parties_signed',
    query: `Have all parties related to this document signed the document? Please return the answer as either 'Yes' or 'No'.`,
  },
  {
    dbName: 'required_signature_count',
    query:
      'How many signatures does this document require in total? Please return the total number of signatures required for the contract, not the number of signatures still pending. Data type of response should be number',
  },
  {
    dbName: 'date_of_last_signature',
    query:
      'What is the date of the last signature? Please return the date in the format of YYYY-MM-DD',
  },
  {
    dbName: 'ai_training_restrictions',
    query: `
      Analyze the provided data provider agreement document. Your task is to identify and extract any specific clause(s) that explicitly restrict or prohibit the **Customer** (or Licensee, Client, etc. - the party receiving the data/service) from performing certain actions related to AI model training.

      Specifically, look for restrictions preventing the **Customer/Licensee** from using:
      *   The Provider's (or Vendor's, Licensor's, etc.) data, content, materials.
      *   The Provider's services, platform, software, APIs.
      *   Any outputs, results, or information generated by or derived from the Provider's services or data.

      For the purpose of:
      *   **Training**
      *   **Developing**
      *   **Building**
      *   **Enhancing** or **Improving**
      *   Artificial Intelligence (AI) models, Large Language Models (LLMs), machine learning (ML) models, or similar algorithms.

      **Crucially, ensure the identified restriction applies to the Customer/Licensee**, not the Provider. Clauses restricting the Provider's use of Customer data for training should be disregarded for this specific request.

      Review sections commonly containing restrictions, such as "License Grant," "Scope of Use," "Restrictions," "Prohibited Uses," "Acceptable Use Policy (AUP)," "Intellectual Property," or specific "Data Usage" clauses.

      Please extract the full text of the relevant clause(s), including the section number(s) or title(s) if available. If no such explicit restriction *on the Customer/Licensee* regarding AI training is found in the document, please state that clearly.
    `,
  },
  {
    dbName: 'data_delivery_methods',
    query: `
      Analyze the provided data vendor agreement and extract only the names of the specific technologies or methods offered for data delivery and access.

      Your goal is to identify the names of the tools, platforms, or protocols the client can use to receive data. Focus on finding specific, named technologies.

      Scan the document for keywords that indicate a delivery method, such as:
      *   Cloud platforms (\`AWS S3\`, \`S3 Bucket\`)
      *   Proprietary software (\`Virtual Drive\`)
      *   Standard tools (\`Command Line Interface\`, \`API\`)
      *   Database types (\`SQL Database\`)
      *   File formats (\`CSV\`)

      Return a flat JSON list containing strings. Each string in the list should be the concise name of a single delivery method. Do not include descriptions or source text.

      Based on the provided AlgoSeek contract, the ideal output is a simple list of names:

      [\\"AWS S3\\", \\"Virtual Drive\\", \\"Command Line Interface\\", \\"SQL Database\\", \\"CSV Download\\"]
    `,
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.STRING,
    },
  },
  productsListQuery,
];
