/**
 * Exchange Agreement (Euronext) product extraction.
 *
 * The zod schema below is the single source of truth: it carries the per-field
 * prompt in `.describe()` (the IRI pattern, see `investorFieldSchemas/`), gives
 * the Gemini response schema its shape, and validates the model's answer before
 * anything reaches the database.
 *
 * Output is written to `ai_extraction.products_list` in the same array shape the
 * legacy string prompt produces, plus `product_code`. Every existing consumer —
 * `parseProductsList`, the extractor form's `products_list` link, lineage
 * product matching — keeps working unchanged.
 */
import { SchemaType } from '@google/generative-ai';
import { z } from 'zod';
import { stripProductCodeFromName } from '@/lib/exchange-agreement/productName';

export const exchangeAgreementProductSchema = z.object({
  year: z
    .string()
    .describe(
      'The contract year this line applies to, as a digit string starting at "1". Derive it from the contract term or from product-specific dates.',
    ),
  product_name: z
    .string()
    .describe(
      'The product description exactly as written, character for character. Never transliterate, spell-correct, abbreviate or ASCII-ify it: "BØRS" stays "BØRS".',
    ),
  product_code: z
    .string()
    .nullable()
    .describe(
      `The Exchange Agreement Product Code for this line, for example "MAFFL2-BANDRU", "ECB10-TPLNDRUA" or "DEQLP-OCW1".

These documents use two different layouts. Handle both:

1. Leading code, used on invoices and fee schedules. The code is the first token of
   the line and is followed by the marker "ENX":
     "DEQL2-BANDRU ENX Dublin Equities L2-NonDisplay Broking/Agents Basic"
     -> product_code "DEQL2-BANDRU"
   "ENX" is NOT part of the code and must be excluded.

2. Trailing code in parentheses, used on service orders. The line spells out
   "Euronext", there is no "ENX" marker, and the code is the parenthesised value at
   the very end:
     "Euronext Milan AFF Level 2 - Non-Display Broking/Agents Restricted Basic (MAFFL2-BANDRU)"
     -> product_code "MAFFL2-BANDRU"
   Do not include the parentheses.

Shape: typically 4 to 6 uppercase alphanumeric characters, a single hyphen, then 4 to 8 —
mostly letters, with any digits at the end of either part. Treat that as a guide, not a
rule: extract any short uppercase identifier of that general form and never reject one for
being longer or shorter than the typical case.

Copy the code verbatim, character for character. Never expand, truncate or normalise it:
a trailing letter is significant, so "MAFFL2-TPLNDRU" and "MAFFL2-TPLNDRUA" are different
codes and must not be conflated. Do not invent a code, and do not derive one from the
description. Return null if the line shows no code.`,
    ),
  cost: z
    .string()
    .nullable()
    .describe(
      'The fee for this line as a digit string. Strip currency symbols and thousands separators, so "€2,681.80" becomes "2681.80". Keep the decimal part exactly as written and never round it: these fees are compared against the invoiced amount to the cent.',
    ),
  n_users: z
    .string()
    .nullable()
    .describe(
      'The total number of users or licences allocated to this product, as a digit string. Return null if the document does not state one.',
    ),
  account_number: z
    .string()
    .nullable()
    .optional()
    .describe(
      'The account this line is billed against, often shown in a "Related Acct" column. Copy it verbatim. Return null if the line shows none.',
    ),
  quantity: z
    .string()
    .nullable()
    .optional()
    .describe(
      'The number of units billed on this line, as a digit string. This counts whatever the line bills — terminals, keyboards, feeds — which is not always users, so do not copy n_users into it. Return null if the line shows no quantity.',
    ),
  change_activity: z
    .string()
    .nullable()
    .optional()
    .describe(
      'Any change noted against this line, such as "Added", "Removed" or "Amended", copied as written. Return null if the line shows none.',
    ),
  rate: z
    .string()
    .nullable()
    .optional()
    .describe(
      'The per-unit rate for this line as a digit string, with currency symbols and thousands separators stripped. This is the rate, not the line total: do not divide cost by quantity to produce one. Return null if the line shows no rate.',
    ),
  period_start: z
    .string()
    .nullable()
    .optional()
    .describe(
      "The first day of the billing period this line covers, as YYYY-MM-DD. This is the line's own period, which may differ from the contract term. Return null if the line shows none.",
    ),
  period_end: z
    .string()
    .nullable()
    .optional()
    .describe(
      "The last day of the billing period this line covers, as YYYY-MM-DD. This is the line's own period, which may differ from the contract term. Return null if the line shows none.",
    ),
});

export const exchangeAgreementProductsListSchema = z.array(
  exchangeAgreementProductSchema,
);

export type ExchangeAgreementProduct = z.infer<
  typeof exchangeAgreementProductSchema
>;

/**
 * Renders the zod object as Gemini response-schema properties so the field
 * prompts are not written twice. Only the primitives this schema uses are
 * handled; anything else is a programming error rather than a runtime case.
 */
function geminiPropertiesFrom(shape: Record<string, z.ZodTypeAny>) {
  return Object.fromEntries(
    Object.entries(shape).map(([fieldName, field]) => {
      let inner: z.ZodTypeAny = field;
      let isNullable = false;
      while (inner instanceof z.ZodNullable || inner instanceof z.ZodOptional) {
        isNullable = true;
        inner = (
          inner as z.ZodNullable<z.ZodTypeAny> | z.ZodOptional<z.ZodTypeAny>
        ).unwrap();
      }

      if (!(inner instanceof z.ZodString)) {
        throw new Error(
          `Unsupported schema type for Gemini property "${fieldName}"`,
        );
      }

      return [
        fieldName,
        {
          type: SchemaType.STRING,
          description: field.description,
          nullable: isNullable,
        },
      ];
    }),
  );
}

/**
 * Identifier prefixes that name a document, not a product. `EMDA-…` is the
 * agreement reference printed on these very documents, so a model that has not
 * fully honoured the exclusion rules will reach for it as a product code.
 */
const DOCUMENT_ID_CODE_PREFIXES = ['EMDA-'];

/**
 * Post-parse cleanup of an extracted product line: drops a code that is really a
 * document identifier, and removes the code from the description so the same
 * product reads identically on a service order and on an invoice.
 *
 * The line itself is always kept — a product with an unusable code is still a
 * product, and dropping it would silently lose a fee.
 */
export function sanitizeExchangeAgreementProduct(
  product: ExchangeAgreementProduct,
): ExchangeAgreementProduct {
  const code = product.product_code?.trim() || null;
  const isDocumentId =
    !!code &&
    DOCUMENT_ID_CODE_PREFIXES.some((prefix) =>
      code.toUpperCase().startsWith(prefix),
    );
  const productCode = isDocumentId ? null : code;

  return {
    ...product,
    product_code: productCode,
    product_name: stripProductCodeFromName(product.product_name, code),
  };
}

/**
 * Drop-in replacement for `productsListQuery` on Exchange Agreement documents.
 *
 * Declared as a real ARRAY schema (the `amended_clauses` pattern) rather than a
 * JSON blob inside a STRING field, so a long product table cannot be truncated
 * into an unparseable string and silently lose every product link.
 */
export const exchangeAgreementProductsListQuery = {
  dbName: 'products_list',
  query: `List every product on this Exchange Agreement document with its Exchange Agreement Product Code and cost. A product is a distinct licence the customer is subscribing to, being billed for, or ordering.

Rules:
- On a fee schedule or service order, return every distinct product once per contract year: within a single year do not repeat the same product code, though across different years the same product is expected to appear again.
- On an invoice, return one entry per billing line instead. An invoice may bill the same product on several lines — a different account, period, rate or change activity on each — and each of those lines must come back separately. Never merge or sum them.
- Include only things being ordered or billed. Exclude document-level identifiers that are not themselves a product — the agreement or contract number (for example an "EMDA-" reference), the order-form or version id, section and clause references, customer, account or subscriber numbers, invoice numbers, and page or table labels. None of these is a product code.
- Products may be listed as a table of invoice lines, as a fee schedule, or as a bulleted list grouped under market headings such as "Euronext Milan" or "Euronext/Oslo Børs". Read every group.
- Include a product even when its code is missing; set product_code to null in that case rather than guessing one.
- Ignore headings, subtotals and totals, legal boilerplate, contracting-party details, and signature blocks.

The product code and the product name must be reported exactly as the document writes them. This document's codes are the join key against the related Schedule of Fees, Service Order and Invoice, so any normalisation, correction or completion of a code makes it unusable.`,
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: geminiPropertiesFrom(exchangeAgreementProductSchema.shape),
    required: ['year', 'product_name'],
  },
};
