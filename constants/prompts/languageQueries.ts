import { SchemaType } from '@google/generative-ai';

export const languageQueries = [
  {
    dbName: 'language_code',
    type: SchemaType.STRING,
    query: `Identify the primary language the body text of this document is written in.

Rules:
- Respond with the lowercase ISO 639-1 two-letter code only (for example "en", "de", "fr", "es", "it", "nl").
- Judge by the substantive body text of the agreement, not by isolated proper nouns, party names, addresses, or defined terms that may appear in another language.
- If the document mixes languages, return the code of the language the majority of the body text is written in.
- If the document is a scanned image, read the visible text to make the determination.
- If you genuinely cannot determine the language, return "und".`,
  },
  {
    dbName: 'has_non_english_body_text',
    type: SchemaType.BOOLEAN,
    query: `Does any substantive body text of this document appear in a language other than English?

Rules:
- Answer true if any clause, paragraph, schedule, section heading or table in the body of the agreement is written in a language other than English — even when English is the majority language.
- Ignore isolated proper nouns, party names, addresses, and defined terms that merely happen to be in another language.
- Answer false only when the entire body text is English.`,
  },
  {
    dbName: 'non_english_language_code',
    type: SchemaType.STRING,
    query: `Which non-English language does the document's body text use?

Rules:
- Respond with the lowercase ISO 639-1 two-letter code only (for example "de", "fr", "hi", "es").
- Answer even when English is the majority language: this is the language the foreign clauses are written in, not the majority language.
- If several non-English languages appear, return the one the most body text is written in.
- If the body text is entirely English, or you cannot determine the language, return "und".`,
  },
  {
    dbName: 'confidence',
    type: SchemaType.STRING,
    query:
      'Your confidence in the identified language. Respond with exactly one of "high", "medium" or "low".',
  },
];
