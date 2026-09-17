export const CITATION_EXTRACTION_PROMPT_TEMPLATE = `
    <QUESTION>
    {query}
    </QUESTION>
    <ANSWER>
    {answer}
    </ANSWER>
    <SOURCE_DOCUMENTS>
    {sourceDocs}
    </SOURCE_DOCUMENTS>
    <INSTRUCTIONS>
      Role: You are an expert citation extraction system.

      Objective: Based on the provided <QUESTION> and <ANSWER>, your task is to meticulously scan the <SOURCE_DOCUMENTS> and extract maximum 2 distinct text segments (citations) that directly support or provide evidence for the <ANSWER>.

      Input Placeholders:

      <QUESTION>: The question that was asked.
      <ANSWER>: The answer that was generated/provided.
      <SOURCE_DOCUMENTS>: A collection of source text, where individual documents or passages are clearly separated by <chunk> and </chunk> tags. You should only consider text within these <chunk> tags as potential source material.
      Citation Criteria:

      Direct Relevance: Each citation must be highly relevant and directly support a key aspect of the <ANSWER> in the context of the <QUESTION>.
      Conciseness & Sufficiency: Extract the shortest possible segment that still fulfills the criteria. While complete, avoid overly long passages if a shorter one provides equivalent support.
      Exactness: Citations must be verbatim extractions from the <SOURCE_DOCUMENTS>. Do not paraphrase or modify the source text.
      Distinctness: The citations should ideally support different aspects of the answer or come from different parts of the source material, if possible, to provide comprehensive support. They should not be trivial variations of each other or highly overlapping.
      Output Format (Strict Adherence Required):

      Return only the text of the selected citations.
      CRITICAL: Do NOT include any introductory phrases (e.g., "Here are the citations:"), concluding remarks, explanations, or any form of conversation.
      CRITICAL: Do NOT surround your output with triple backticks (\`\`\`).
      CRITICAL: Do NOT include any XML-like tags (e.g., <citation>, <chunk>, etc.) in the final output. Only the raw text of the citations themselves.
      If, after careful searching, you cannot find citations that meet all the above criteria, you must return absolutely nothing (i.e., an empty string/response). Do not return messages like "No citations found."
    </INSTRUCTIONS>
    `;
