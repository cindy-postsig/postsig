set check_function_bodies = off;

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
BEGIN
    current_user_id := auth.uid();

    IF TG_OP = 'INSERT' THEN
        action_type := 'CREATE';
        old_data := NULL;
        new_data := to_jsonb(NEW);
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
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
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
        old_data := to_jsonb(OLD);
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

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$
;


