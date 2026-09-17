UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT CASE
    WHEN allowed_mime_types IS NULL THEN ARRAY['application/zip']::text[]
    WHEN 'application/zip' = ANY(allowed_mime_types) THEN allowed_mime_types
    ELSE array_append(allowed_mime_types, 'application/zip')
  END
)
WHERE id = 'documents';