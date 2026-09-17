alter table "public"."app_modules" enable row level security;

alter table "public"."document_type_fields" enable row level security;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.enable_rls_on_new_tables()
 RETURNS event_trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  obj record;
  obj_schema text;
  obj_name text;
  fq_name text;
  skip_schemas text[] := ARRAY[
    'pg_catalog', 'information_schema', 'pg_toast', 'pg_temp_1', 'pg_temp_2',
    'pgsodium', 'pgsodium_masks', 'extensions', 'pgbouncer', 'supabase_migrations',
    'supabase_functions', 'graphql', 'graphql_public', 'auth', 'storage', 'realtime',
    '_realtime', 'net', 'vault'
  ];
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF obj.object_type = 'table' OR obj.object_type = 'materialized view' THEN
      -- Use parse_ident for robust handling of all quoting scenarios
      DECLARE
        parts text[];
      BEGIN
        parts := parse_ident(obj.object_identity);
        IF array_length(parts, 1) = 2 THEN
          obj_schema := parts[1];
          obj_name := parts[2];
        ELSIF array_length(parts, 1) = 1 THEN
          obj_schema := current_schema();
          obj_name := parts[1];
        ELSE
          RAISE WARNING 'Unexpected identifier format: %', obj.object_identity;
          CONTINUE;
        END IF;
      END;

      IF obj_schema = ANY(skip_schemas) THEN
        RAISE NOTICE 'Skipping RLS enable for % due to schema in skip list', obj.object_identity;
        CONTINUE;
      END IF;

      fq_name := quote_ident(obj_schema) || '.' || quote_ident(obj_name);

      BEGIN
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY;', fq_name);
        RAISE NOTICE 'Enabled RLS on %', fq_name;
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Failed to enable RLS on %: %', fq_name, SQLERRM;
      END;
    END IF;
  END LOOP;
END;
$function$
;

DROP EVENT TRIGGER IF EXISTS enable_rls_on_create_table;



