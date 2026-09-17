create table "public"."organization_modules" (
    "id" uuid not null default uuid_generate_v4(),
    "organization_id" uuid not null,
    "module_id" integer not null,
    "is_enabled" boolean default true,
    "enabled_at" timestamp with time zone default now(),
    "enabled_by" uuid,
    "settings" jsonb default '{}'::jsonb
);


CREATE UNIQUE INDEX organization_modules_organization_id_module_id_key ON public.organization_modules USING btree (organization_id, module_id);

CREATE UNIQUE INDEX organization_modules_pkey ON public.organization_modules USING btree (id);

alter table "public"."organization_modules" add constraint "organization_modules_pkey" PRIMARY KEY using index "organization_modules_pkey";

alter table "public"."organization_modules" add constraint "organization_modules_enabled_by_fkey" FOREIGN KEY (enabled_by) REFERENCES users(id) not valid;

alter table "public"."organization_modules" validate constraint "organization_modules_enabled_by_fkey";

alter table "public"."organization_modules" add constraint "organization_modules_module_id_fkey" FOREIGN KEY (module_id) REFERENCES app_modules(id) ON DELETE CASCADE not valid;

alter table "public"."organization_modules" validate constraint "organization_modules_module_id_fkey";

alter table "public"."organization_modules" add constraint "organization_modules_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."organization_modules" validate constraint "organization_modules_organization_id_fkey";

alter table "public"."organization_modules" add constraint "organization_modules_organization_id_module_id_key" UNIQUE using index "organization_modules_organization_id_module_id_key";

grant delete on table "public"."app_modules" to "postgres";

grant insert on table "public"."app_modules" to "postgres";

grant references on table "public"."app_modules" to "postgres";

grant select on table "public"."app_modules" to "postgres";

grant trigger on table "public"."app_modules" to "postgres";

grant truncate on table "public"."app_modules" to "postgres";

grant update on table "public"."app_modules" to "postgres";

grant delete on table "public"."organization_modules" to "postgres";

grant insert on table "public"."organization_modules" to "postgres";

grant references on table "public"."organization_modules" to "postgres";

grant select on table "public"."organization_modules" to "postgres";

grant trigger on table "public"."organization_modules" to "postgres";

grant truncate on table "public"."organization_modules" to "postgres";

grant update on table "public"."organization_modules" to "postgres";

grant delete on table "public"."organization_modules" to "service_role";

grant insert on table "public"."organization_modules" to "service_role";

grant references on table "public"."organization_modules" to "service_role";

grant select on table "public"."organization_modules" to "service_role";

grant trigger on table "public"."organization_modules" to "service_role";

grant truncate on table "public"."organization_modules" to "service_role";

grant update on table "public"."organization_modules" to "service_role";


