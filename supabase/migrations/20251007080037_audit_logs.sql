set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.redact_sensitive_jsonb(data jsonb, keys_to_redact text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF data IS NULL THEN
        RETURN NULL;
    END IF;
    
    RETURN (
        SELECT jsonb_object_agg(
            key,
            CASE 
                WHEN key = ANY(keys_to_redact) THEN '"[REDACTED]"'::jsonb
                ELSE value
            END
        )
        FROM jsonb_each(data)
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.audit_trigger_function()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    current_user_id UUID;
    current_org_id UUID;
    action_type TEXT;
    resource_type TEXT;
    resource_id TEXT;
    old_data JSONB;
    new_data JSONB;
    new_jsonb JSONB;
    old_jsonb JSONB;
    redact_keys TEXT[] := ARRAY['password', 'password_hash', 'totp_secret', 'recovery_codes', 'token', 'api_key', 'secret', 'ssn', 'email', 'access_token', 'refresh_token', 'private_key', 'jwt'];
BEGIN
    IF TG_TABLE_NAME = 'audit_logs' OR TG_TABLE_NAME LIKE 'audit_%' THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    current_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        action_type := 'CREATE';
        old_data := NULL;
        new_data := public.redact_sensitive_jsonb(to_jsonb(NEW), redact_keys);
        new_jsonb := new_data;
        
        resource_id := COALESCE(
            (new_jsonb->>'id')::TEXT,
            CASE 
                WHEN new_jsonb ? 'user_id' AND new_jsonb ? 'role_id' THEN
                    (new_jsonb->>'user_id') || ':' || (new_jsonb->>'role_id')
                ELSE NULL
            END
        );

        current_org_id := CASE 
            WHEN new_jsonb ? 'organization_id' THEN (new_jsonb->>'organization_id')::UUID
            WHEN new_jsonb ? 'org_id' THEN (new_jsonb->>'org_id')::UUID
            ELSE NULL
        END;

    ELSIF TG_OP = 'UPDATE' THEN
        action_type := 'UPDATE';
        old_data := public.redact_sensitive_jsonb(to_jsonb(OLD), redact_keys);
        new_data := public.redact_sensitive_jsonb(to_jsonb(NEW), redact_keys);
        old_jsonb := old_data;
        new_jsonb := new_data;
        
        resource_id := COALESCE(
            (new_jsonb->>'id')::TEXT,
            (old_jsonb->>'id')::TEXT,
            CASE 
                WHEN new_jsonb ? 'user_id' AND new_jsonb ? 'role_id' THEN
                    (new_jsonb->>'user_id') || ':' || (new_jsonb->>'role_id')
                WHEN old_jsonb ? 'user_id' AND old_jsonb ? 'role_id' THEN
                    (old_jsonb->>'user_id') || ':' || (old_jsonb->>'role_id')
                ELSE NULL
            END
        );

        current_org_id := CASE 
            WHEN new_jsonb ? 'organization_id' THEN (new_jsonb->>'organization_id')::UUID
            WHEN new_jsonb ? 'org_id' THEN (new_jsonb->>'org_id')::UUID
            WHEN old_jsonb ? 'organization_id' THEN (old_jsonb->>'organization_id')::UUID
            WHEN old_jsonb ? 'org_id' THEN (old_jsonb->>'org_id')::UUID
            ELSE NULL
        END;

    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'DELETE';
        old_data := public.redact_sensitive_jsonb(to_jsonb(OLD), redact_keys);
        new_data := NULL;
        old_jsonb := old_data;
        
        resource_id := COALESCE(
            (old_jsonb->>'id')::TEXT,
            CASE 
                WHEN old_jsonb ? 'user_id' AND old_jsonb ? 'role_id' THEN
                    (old_jsonb->>'user_id') || ':' || (old_jsonb->>'role_id')
                ELSE NULL
            END
        );

        current_org_id := CASE 
            WHEN old_jsonb ? 'organization_id' THEN (old_jsonb->>'organization_id')::UUID
            WHEN old_jsonb ? 'org_id' THEN (old_jsonb->>'org_id')::UUID
            ELSE NULL
        END;
    END IF;

    resource_type := TG_TABLE_NAME;
    BEGIN
        PERFORM public.create_audit_log(
            p_user_id := current_user_id,
            p_session_id := NULL,
            p_ip_address := NULL,
            p_user_agent := NULL,
            p_action := action_type,
            p_resource_type := resource_type,
            p_resource_id := resource_id,
            p_old_data := old_data,
            p_new_data := new_data,
            p_metadata := jsonb_build_object(
                'table_name', TG_TABLE_NAME,
                'schema_name', TG_TABLE_SCHEMA,
                'trigger_operation', TG_OP
            ),
            p_organization_id := current_org_id
        );
    EXCEPTION WHEN OTHERS THEN  
      RAISE WARNING 'audit_trigger_function failed for %.% %: %',  
        TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP, SQLERRM;  
    END; 

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$
;


