CREATE OR REPLACE FUNCTION public.replace_document_type_fields(
  p_master_field_definition_id uuid,
  p_document_type_ids integer[]
) RETURNS SETOF document_type_fields
LANGUAGE plpgsql AS $function$
BEGIN
  IF p_document_type_ids IS NULL THEN
      RAISE EXCEPTION 'p_document_type_ids cannot be NULL';
  END IF;
  
  IF current_user <> 'supabase_admin' AND current_user <> 'postgres' AND current_user <> 'service_role' THEN
    RAISE EXCEPTION USING MESSAGE = format(
      'Only the service role may call this function. current_user = %s',
      current_user
    );
  END IF;

  DELETE FROM document_type_fields
  WHERE master_field_definition_id = p_master_field_definition_id;

  RETURN QUERY
  INSERT INTO document_type_fields (master_field_definition_id, document_type_id)
  SELECT p_master_field_definition_id, unnest(p_document_type_ids)
  ON CONFLICT (master_field_definition_id, document_type_id) DO NOTHING
  RETURNING *;
END;
$function$;