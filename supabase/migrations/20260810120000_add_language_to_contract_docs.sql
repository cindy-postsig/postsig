alter table "public"."contract_docs"
add column "language" text,
add column "translated_file_path" text;

comment on column "public"."contract_docs"."language" is
  'ISO 639-1 code of the language the uploaded document is written in, detected during processing. Null until detection has run.';

comment on column "public"."contract_docs"."translated_file_path" is
  'Path to the English translation of this document in the contract_docs storage bucket. Null when the document is already English or translation failed; extraction and citations read this in preference to file_path.';
