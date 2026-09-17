set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.match_documents(query_embedding vector, match_threshold double precision DEFAULT 0.7, match_count integer DEFAULT 5, input_contract_id integer DEFAULT NULL::integer)
 RETURNS TABLE(id text, content text, metadata jsonb, similarity double precision)
 LANGUAGE plpgsql
AS $function$BEGIN   
   RETURN QUERY   
   SELECT     
       documents.id,     
       documents.content,     
       documents.metadata,     
       1 - (documents.embedding <=> query_embedding) AS similarity   
   FROM documents   
   WHERE 1 - (documents.embedding <=> query_embedding) > match_threshold 
   AND (documents.contract_id = input_contract_id OR input_contract_id IS NULL) 
   ORDER BY documents.embedding <=> query_embedding   
   LIMIT match_count; 
END;$function$
;


