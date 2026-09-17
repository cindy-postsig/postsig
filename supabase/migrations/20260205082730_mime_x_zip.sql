UPDATE storage.buckets
SET allowed_mime_types = (
  SELECT CASE
    WHEN allowed_mime_types IS NULL THEN ARRAY['application/x-zip-compressed']::text[]
    WHEN 'application/x-zip-compressed' = ANY(allowed_mime_types) THEN allowed_mime_types
    ELSE array_append(allowed_mime_types, 'application/x-zip-compressed')
  END
)
WHERE id = 'documents';