import { SchemaType } from '@google/generative-ai';

export const technicalQueries = [
  {
    dbName: 'scanned_doc',
    query: `You are a document analysis expert specializing in determining the origin of PDF files.  I will provide you with the content of a PDF document. Your task is to analyze this content and determine, with the highest degree of certainty possible, whether the PDF was created from a *scanned* physical document or if it was generated digitally (e.g., from a word processor, spreadsheet, or other software).

Consider the following factors in your analysis:

1. **Text Extractability:** Can the text be selected and copied accurately and completely?  If so, describe the quality of the extracted text (e.g., are there consistent errors, unusual character substitutions, or unexpected spacing issues?).  If not, explain why (e.g., is it selectable but garbled, or is it completely unselectable?).

2. **Image Presence and Characteristics:**  Are there any embedded images? If so, describe their characteristics.  Do they appear to be photographs of a document (e.g., showing signs of skew, uneven lighting, shadows, page curvature, visible paper texture, or artifacts from the scanning process like moiré patterns)?  Are there multiple images that appear to be pages of the same document?

3. **Font Consistency and Embedding:** If text is extractable, analyze the fonts used. Are multiple fonts used in a way that seems inconsistent with a digitally-created document? Are the fonts common fonts used in word processing, or are they fonts typically associated with OCR software output?  Are the fonts embedded within the PDF? (If possible, provide information about font embedding status).

4. **Text Structure and Layout:** Does the text layout and structure appear perfectly aligned and consistent, as expected from a digitally-created document?  Or are there subtle misalignments, slight rotations of text blocks, or inconsistencies in spacing that might indicate a scanned document that has undergone OCR (Optical Character Recognition)?

5. **Presence of OCR Artifacts:**  Look for common OCR errors, such as:
    *   Misrecognized characters (e.g., "rn" instead of "m", "cl" instead of "d", "1" instead of "l" or "I").
    *   Unusual character spacing or kerning.
    *   Words incorrectly split or joined.
    *   Text rendered as images.

6.  **Metadata (If Accessible):** If you have access to the PDF's metadata (creation date, application used, author, etc.), state the relevant metadata fields and explain how (or if) they support your conclusion. *However, do not rely solely on metadata, as it can be easily manipulated.*

7. **Overall Confidence Level:**  Based on your analysis, state your overall confidence level in your determination (e.g., "High Confidence," "Medium Confidence," "Low Confidence," "Unable to Determine").  Explain the reasons for your confidence level.

8. **Alternative Possibilities:** Briefly consider and address the possibility that the document might be a *hybrid* – partially scanned and partially digitally created.

Your response should be only one of the following:

*   **Scanned:** Created from a physical document scan.
*   **Digitally Generated:** Created directly from software.
*   **Hybrid:** A combination of scanned and digitally generated content.
*   **Undetermined:** Insufficient information to make a determination.`,
  },
  {
    dbName: 'multiple_contracts',
    query: `You are a legal document analysis expert specializing in contract identification and segmentation.  Your task is to meticulously analyze this document and determine the following:

**Primary Task:**

1.  **Contract Count:** Determine the *exact* number of distinct, legally binding contracts contained within the provided PDF.  A single contract might span multiple pages. Do *not* count exhibits, schedules, appendices, or amendments as separate contracts *unless* they are explicitly presented as independent, standalone agreements with their own, separate execution (signature) blocks.  Focus on identifying the *core* agreements. If you are uncertain, err on the side of *fewer* contracts and clearly explain your reasoning.
2.  **Contract Boundaries (Page Ranges):** For *each* contract you identify, provide the precise page range (inclusive) where that contract begins and ends.  Be precise: e.g., "Contract 1: Pages 3-12". If a contract starts or ends mid-page, specify the page number and indicate, if possible, a distinguishing phrase or heading near the start/end point (e.g., "Contract 2: Pages 15-27 (ends just before the 'Exhibit A' heading)").
3.  **Contract Type (Optional, but HIGHLY valuable):** If possible, *briefly* describe the *type* of each contract you identify (e.g., "Service Agreement," "Non-Disclosure Agreement," "Amendment to Prior Agreement," "Lease Agreement").  This helps confirm your understanding.
4. **Confidence Level:** For each contract identified, provide a confidence level (High, Medium, Low) regarding both the count and the page range determination. Explain *briefly* the reasons for your confidence level. This is *crucial* for assessing the reliability of the response.

**Key Considerations and Instructions:**

*   **Differentiating Contracts:**  Look for key indicators of separate contracts, such as:
    *   **Independent Execution Blocks:**  Separate signature pages or signature blocks for different parties strongly suggest separate contracts.
    *   **Distinct Recitals/Whereas Clauses:**  New sets of introductory clauses defining the parties and the purpose of the agreement often signal a new contract.
    *   **Clear Titling:**  Distinct titles (e.g., "Master Services Agreement" followed later by "Statement of Work") can indicate separate agreements, especially if they have separate execution blocks.
    *   **Independent Governing Law Clauses:** If different sections of the document specify different governing laws, this *may* indicate separate contracts, but be cautious; a master agreement might govern underlying SOWs.
    *   **Complete Agreement Clauses:** The presence of clauses stating "This Agreement constitutes the entire agreement..." are strong indicators of contract boundaries.
*   **Exhibits, Schedules, Amendments:**  These are *usually* part of a *single* contract, *unless* they are clearly presented and executed as independent agreements.  Carefully analyze how they are referenced and incorporated. If an exhibit is itself a signed agreement, it *could* be a separate contract.
*   **Master Agreements and Sub-Agreements (SOWs, etc.):** Be particularly careful with documents that might contain a Master Agreement followed by Statements of Work (SOWs) or Task Orders.  A Master Agreement sets overall terms, while SOWs describe specific projects.  These are *often* considered part of a single contractual relationship, but *separate* execution of SOWs might indicate separate contracts. Analyze the language carefully.
*   **Ambiguity:** If you encounter sections where it is genuinely unclear whether something is part of a larger contract or a separate contract, *clearly* state the ambiguity, explain the potential interpretations, and provide your *best judgment* with a corresponding confidence level.
*   **Output Format:** Use a clear, structured format, like this:

    Contract Count: [Number]
    Confidence Level (Overall): [High/Medium/Low]

    Contract 1:
        Page Range: [Start Page] - [End Page] (Explain any partial pages)
        Type (Optional): [e.g., Master Services Agreement]
        Confidence Level (Contract 1): [High/Medium/Low]
        Reasoning: [Brief explanation of why this is considered a separate contract and why the page range was chosen]

    Contract 2:
        Page Range: ...
        Type (Optional): ...
        Confidence Level (Contract 2): ...
        Reasoning: ...

    [Repeat for each contract]

    Ambiguities and Notes:
    [Any areas of uncertainty, alternative interpretations, or important observations]
`,
    type: SchemaType.OBJECT,
    properties: {
      is_multi_contract: { type: SchemaType.BOOLEAN },
      contracts: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            page_range: {
              type: SchemaType.OBJECT,
              properties: {
                start: { type: SchemaType.NUMBER },
                end: { type: SchemaType.NUMBER },
              },
            },
            confidence_level: { type: SchemaType.STRING },
            reasoning: { type: SchemaType.STRING },
          },
        },
      },
    },
  },
];
