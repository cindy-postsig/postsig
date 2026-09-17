-- Fix file_type column size to accommodate long MIME types like DOCX
-- DOCX MIME type: application/vnd.openxmlformats-officedocument.wordprocessingml.document (71 chars)
ALTER TABLE module_document_files 
ALTER COLUMN file_type TYPE character varying(255);
