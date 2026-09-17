export const extractTextPrompt = `OCR the following page into Markdown. 
Tables should be formatted as HTML. 
Very important: Do not surround your output with triple backticks.

Chunk the document into sections of roughly 250 - 1000 words. Our goal is 
to identify parts of the page with same semantic theme. These chunks will 
be embedded and used in a RAG pipeline. 

Surround the chunks with <chunk> </chunk> html tags.`;
