-- Add partial index on file_hash for efficient duplicate detection
-- Only indexes non-null hashes to optimize lookup performance

CREATE INDEX IF NOT EXISTS idx_module_document_files_file_hash
ON public.module_document_files (file_hash)
WHERE file_hash IS NOT NULL;
