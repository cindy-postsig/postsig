create sequence "public"."audit_log_id_seq";

drop policy "Users can create a row" on "public"."user_roles2";

drop policy "Users can update their own rows" on "public"."user_roles2";

alter table "public"."evaluation_runs" drop constraint "evaluation_runs_gemini_model_check";

create table "public"."audit_log" (
    "id" bigint not null default nextval('audit_log_id_seq'::regclass),
    "timestamp" timestamp with time zone not null default now(),
    "user_id" uuid,
    "session_id" text,
    "ip_address" inet,
    "user_agent" text,
    "action" text not null,
    "resource_type" text not null,
    "resource_id" text,
    "old_data" jsonb,
    "new_data" jsonb,
    "metadata" jsonb,
    "organization_id" uuid
);


alter table "public"."audit_log" enable row level security;

alter table "public"."evaluation_runs" add column "system_prompt_id" uuid;

alter sequence "public"."audit_log_id_seq" owned by "public"."audit_log"."id";

CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id);

CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action);

CREATE INDEX idx_audit_log_org_timestamp ON public.audit_log USING btree (organization_id, "timestamp");

CREATE INDEX idx_audit_log_organization_id ON public.audit_log USING btree (organization_id);

CREATE INDEX idx_audit_log_resource_type ON public.audit_log USING btree (resource_type);

CREATE INDEX idx_audit_log_session_id ON public.audit_log USING btree (session_id);

CREATE INDEX idx_audit_log_timestamp ON public.audit_log USING btree ("timestamp");

CREATE INDEX idx_audit_log_user_id ON public.audit_log USING btree (user_id);

CREATE INDEX idx_audit_log_user_timestamp ON public.audit_log USING btree (user_id, "timestamp");

alter table "public"."audit_log" add constraint "audit_log_pkey" PRIMARY KEY using index "audit_log_pkey";

alter table "public"."audit_log" add constraint "audit_log_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) not valid;

alter table "public"."audit_log" validate constraint "audit_log_organization_id_fkey";

alter table "public"."audit_log" add constraint "audit_log_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) not valid;

alter table "public"."audit_log" validate constraint "audit_log_user_id_fkey";

alter table "public"."evaluation_runs" add constraint "evaluation_runs_system_prompt_id_fkey" FOREIGN KEY (system_prompt_id) REFERENCES prompt_templates(id) not valid;

alter table "public"."evaluation_runs" validate constraint "evaluation_runs_system_prompt_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.audit_auth_user_change(p_user_id uuid, p_action text, p_old_data jsonb DEFAULT NULL::jsonb, p_new_data jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    PERFORM public.create_audit_log(
        p_user_id := p_user_id,
        p_action := p_action,
        p_resource_type := 'auth_users',
        p_resource_id := p_user_id::TEXT,
        p_old_data := p_old_data,
        p_new_data := p_new_data,
        p_metadata := COALESCE(p_metadata, '{}'::JSONB)
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
BEGIN
    -- Get current user from auth context
    current_user_id := auth.uid();

    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        action_type := 'CREATE';
        old_data := NULL;
        new_data := to_jsonb(NEW);
        IF resource_id IS NULL AND TG_TABLE_NAME IN ('user_roles','user_roles2') THEN  
            resource_id := COALESCE(NEW.user_id::TEXT, OLD.user_id::TEXT) || ':' ||  
                           COALESCE(NEW.role_id::TEXT, OLD.role_id::TEXT);  
        END IF;  

        -- Get organization_id from the new record if available
        current_org_id := COALESCE(
            (new_data->>'organization_id')::UUID,
            (new_data->>'org_id')::UUID
        );

    ELSIF TG_OP = 'UPDATE' THEN
        action_type := 'UPDATE';
        old_data := to_jsonb(OLD);
        new_data := to_jsonb(NEW);
        resource_id := COALESCE(NEW.id::TEXT, OLD.id::TEXT);

        -- Get organization_id from the record
        current_org_id := COALESCE(
            (new_data->>'organization_id')::UUID,
            (new_data->>'org_id')::UUID,
            (old_data->>'organization_id')::UUID,
            (old_data->>'org_id')::UUID
        );

    ELSIF TG_OP = 'DELETE' THEN
        action_type := 'DELETE';
        old_data := to_jsonb(OLD);
        new_data := NULL;
        resource_id := OLD.id::TEXT;

        -- Get organization_id from the old record
        current_org_id := COALESCE(
            (old_data->>'organization_id')::UUID,
            (old_data->>'org_id')::UUID
        );
    END IF;

    -- Set resource type based on table name
    resource_type := TG_TABLE_NAME;

    -- Create audit log entry
    PERFORM public.create_audit_log(
        p_user_id := current_user_id,
        p_session_id := NULL, -- Will be set at application level
        p_ip_address := NULL, -- Will be set at application level
        p_user_agent := NULL, -- Will be set at application level
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

    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_audit_log(p_user_id uuid DEFAULT NULL::uuid, p_session_id text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_action text DEFAULT NULL::text, p_resource_type text DEFAULT NULL::text, p_resource_id text DEFAULT NULL::text, p_old_data jsonb DEFAULT NULL::jsonb, p_new_data jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    audit_id BIGINT;
BEGIN
    INSERT INTO public.audit_log (
        user_id,
        session_id,
        ip_address,
        user_agent,
        action,
        resource_type,
        resource_id,
        old_data,
        new_data,
        metadata,
        organization_id
    )
    VALUES (
        p_user_id,
        p_session_id,
        p_ip_address,
        p_user_agent,
        p_action,
        p_resource_type,
        p_resource_id,
        p_old_data,
        p_new_data,
        p_metadata,
        p_organization_id
    )
    RETURNING id INTO audit_id;

    RETURN audit_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$declare
    claims jsonb;
    user_role public.app_role;
    r_id int4;
  begin
    -- Check if the user is marked as admin in the profiles table
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;
    select role_id into r_id from public.user_roles2 where user_id = (event->>'user_id')::uuid;

    claims := event->'claims';

    if user_role is not null then
      -- Set the claim
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    else
      claims := jsonb_set(claims, '{user_role}', 'null');
    end if;

    if r_id is not null then
      -- Set the claim
      claims := jsonb_set(claims, '{r_id}', to_jsonb(r_id));
    else
      claims := jsonb_set(claims, '{r_id}', 'null');
    end if;

    -- Update the 'claims' object in the original event
    event := jsonb_set(event, '{claims}', claims);

    -- Return the modified or original event
    return event;
  end;$function$
;

grant delete on table "public"."audit_log" to "anon";

grant insert on table "public"."audit_log" to "anon";

grant references on table "public"."audit_log" to "anon";

grant select on table "public"."audit_log" to "anon";

grant trigger on table "public"."audit_log" to "anon";

grant truncate on table "public"."audit_log" to "anon";

grant update on table "public"."audit_log" to "anon";

grant delete on table "public"."audit_log" to "authenticated";

grant insert on table "public"."audit_log" to "authenticated";

grant references on table "public"."audit_log" to "authenticated";

grant select on table "public"."audit_log" to "authenticated";

grant trigger on table "public"."audit_log" to "authenticated";

grant truncate on table "public"."audit_log" to "authenticated";

grant update on table "public"."audit_log" to "authenticated";

grant delete on table "public"."audit_log" to "service_role";

grant insert on table "public"."audit_log" to "service_role";

grant references on table "public"."audit_log" to "service_role";

grant select on table "public"."audit_log" to "service_role";

grant trigger on table "public"."audit_log" to "service_role";

grant truncate on table "public"."audit_log" to "service_role";

grant update on table "public"."audit_log" to "service_role";

grant select on table "public"."users" to "supabase_auth_admin";

create policy "audit_log_insert_policy"
on "public"."audit_log"
as permissive
for insert
to public
with check ((((current_setting('request.jwt.claims'::text, true))::jsonb ->> 'role'::text) = 'service_role'::text));


create policy "audit_log_no_delete_policy"
on "public"."audit_log"
as permissive
for delete
to public
using (false);


create policy "audit_log_no_update_policy"
on "public"."audit_log"
as permissive
for update
to public
using (false);


create policy "audit_log_select_policy"
on "public"."audit_log"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM (user_roles2 ur
     JOIN users u ON ((ur.user_id = u.id)))
  WHERE ((u.id = auth.uid()) AND (ur.role_id = 1)))));


CREATE TRIGGER audit_app_invites_trigger AFTER INSERT OR DELETE OR UPDATE ON public.app_invites FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_organizations_trigger AFTER INSERT OR DELETE OR UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_user_roles2_trigger AFTER INSERT OR DELETE OR UPDATE ON public.user_roles2 FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_users_trigger AFTER INSERT OR DELETE OR UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();


