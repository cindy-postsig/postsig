ALTER TABLE document_field_values
  DROP CONSTRAINT dfv_doc_field_def_unique;

ALTER TABLE document_field_values
  ADD CONSTRAINT dfv_doc_field_def_unique unique (module_document_id, field_definition_id, module_extraction_id)