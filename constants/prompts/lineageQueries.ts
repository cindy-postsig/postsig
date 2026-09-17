import { baseQueries } from './baseQueries';

export const lineageQueries = [
  {
    dbName: 'is_modification',
    query: `Is this contract a modification to another contract or agreement other than the document itself?
      Look for phrases that indicate:
  
  1. Contract modifications/updates:
  - "is a renewal of"
  - "is an amendment to"
  - "is a modification to"
  - "is a supplement to"
  - "is a replacement for"
  - "supersedes"
  - "extends"
  - "terminates"
  - "cancels"
  
  2. Financial relationships:
  - "is an invoice for"
  - "is a billing statement for"
  - "is payment against"
  - "references purchase order"
  - "relates to statement of work"
  
  3. Supporting documents:
  - "is an addendum to"
  - "is an exhibit to"
  - "is an appendix to"
  - "is attached to"
  - "incorporates"
  - "incorporated"
  - "references"
  
  4. Dependent relationships:
  - "is subject to"
  - "is contingent upon"
  - "is pursuant to"
  - "is in accordance with"
  - "is dependent on"
  Skip the ones that the document references itself.
  Return only the boolean value, true or false.  If you are not sure, return false.`,
  },
  {
    dbName: 'order_number',
    query: `What is the number this document assigns to itself?

      It is the identifier printed on the document, usually near the top or in the
      header, under any of these labels:
      - "contract number", "contract no.", "contract #"
      - "agreement number"
      - "order number", "purchase order number", "PO number"
      - "service order number", "SO number"
      - "quote number"
      - "invoice number"
      - "document number", "reference number"

      Return the value exactly as printed, keeping its punctuation, letters and
      leading zeros: "202.205-23" stays "202.205-23" and "INV-2024-001" stays
      "INV-2024-001". Do not reformat it, strip characters from it, or repeat the
      label alongside it.

      Do not return a number that identifies something other than this document:
      account, subscriber or customer numbers, tax or VAT registration numbers,
      section, clause, page or table references, product or SKU codes, or the
      number of a different agreement that this document refers to.

      If the document carries more than one such identifier, return the one that
      names the document as a whole rather than one of its parts.

      Return null if the document states no number of its own.`,
  },
  {
    dbName: 'parent_agreement_order_number',
    query: `What is the order number that is referenced to the modified agreement? Look for phrases that indicate:
        - "order number"
        - "purchase order number"
        - "PO number"
        - "order number"
        - "purchase order number"
        - "PO number"`,
  },
  {
    dbName: 'parent_agreement_type',
    query: `What type of modified agreement/contract is referenced to this document?
      Please return only one option out of the following as the answer for the type of contract.
  
      Answer should only be the abbreviation before the : symbol. For example the answer could be SO.
  
      Following is the list of options:
  
      - **MSA**: Master Service Agreement
      - **SO**: Service order
      - **Addendum**: Addendum or Addition to an existing contract
      - **TOS**: Terms of Service
      - **Invoice**: Invoice
      - **Trial Agreement**: Trial Agreement
      - **NDA**: Non disclosure agreement
      - **OA**: Operational Agreement
         `,
  },
  {
    dbName: 'parent_agreement_date',
    query: `What is the effective date or execution date of the referenced or modified contract? Look for dates that are specifically associated with the master or base agreement, not the current document.
  
  Look for patterns like:
  - "with an Effective Date of [DATE]"
  - "entered into on [DATE]"
  - "dated [DATE]"
  - "executed on [DATE]"
  
  Return only the date in YYYY-MM-DD format, or null if no date is found.`,
  },
  {
    dbName: 'parent_relationship_type',
    query: `How is this document related to the modified contract? Look for specific relationship phrases like:
  - "is governed by"
  - "is an attachment to"
  - "pursuant to"
  - "subject to"
  - "incorporated into"
  - "supplements"
  
  Return only the exact relationship phrase found, or null if none is mentioned.`,
  },
  {
    dbName: 'lineage_phrases',
    query: `What is the lineage or relationship of this contract to other contracts? Look for phrases that indicate:
  
  1. Contract modifications/updates:
  - "is a renewal of"
  - "is an amendment to"
  - "is a modification to"
  - "is a supplement to"
  - "is a replacement for"
  - "supersedes"
  - "extends"
  - "terminates"
  - "cancels"
  
  2. Financial relationships:
  - "is an invoice for"
  - "is a billing statement for"
  - "is payment against"
  - "references purchase order"
  - "relates to statement of work"
  
  3. Supporting documents:
  - "is an addendum to"
  - "is an exhibit to"
  - "is an appendix to"
  - "is attached to"
  - "incorporates"
  - "references"
  
  4. Dependent relationships:
  - "is subject to"
  - "is contingent upon"
  - "is pursuant to"
  - "is in accordance with"
  - "is dependent on"
  
  Please capture all the parts of the document that indicate the relationship between this contract and other contracts or documents.
  Please return as string
  Skip the ones that the document references itself.`,
  },
  baseQueries.find((query) => query.dbName === 'products_list'),
];
