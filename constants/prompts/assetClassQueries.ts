import { SchemaType } from '@google/generative-ai';
import { assetClasses } from '../data';

export const assetClassQueries = [
  {
    dbName: 'asset_classes',
    query: `Extract from the provided contract text, *only* the Asset Class and Sub-Asset Class information, strictly adhering to the following hierarchical classification. Return *only* the matching Asset Class and Sub-Asset Class. If multiple Asset/Sub-Asset classes are present, list each pair on it's own line, and be comprehensive. If there are no sub asset classes found for an asset class, return the sub asset classes field as an empty array.  Do not return anything that isn't explicitly listed.

**Structure the output precisely as follows, one line per Asset/Sub-Asset class pair. DO NOT include any other information.**

**Classification List (Strict Adherence Required):**
${assetClasses
  .map(
    (assetClass) => `*   **${assetClass.name}:**\n
    *   ${assetClass.subClasses.join('\n    *   ')}`,
  )
  .join('\n')}

**Extraction Rules:**

1.  **Exact Match:** Prioritize exact matches to the Sub-Asset Classes listed above.
2.  **Parent as Sub-Asset:** If a parent Asset Class (e.g., "Equities") is found *and* no specific Sub-Asset Class within that parent is identified, then the parent Asset Class name *also* serves as the Sub-Asset Class.
3.  **Comprehensive Extraction:** Extract *all* Asset Class and Sub-Asset Class pairs present in the contract. Be exhaustive. Do not stop at the first match. Multiple lines of output are expected if multiple asset classes are present.
4. No Inference. Do not infer, assume, or add classes.
5. Be exhaustive in the search of the document.
6. Return *only* the Asset/Sub Asset Class. Do not return any other verbiage from the contract.`,
    type: SchemaType.ARRAY,
    items: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING },
        sub_asset_classes: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
    },
  },
];
