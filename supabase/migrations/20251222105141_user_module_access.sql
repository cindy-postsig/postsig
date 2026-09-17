create table "public"."user_module_access" (
    "id" uuid not null default uuid_generate_v4(),
    "user_id" uuid not null,
    "organization_id" uuid not null,
    "module_id" integer not null,
    "is_default" boolean default false,
    "granted_at" timestamp with time zone default now(),
    "granted_by" uuid,
    "revoked_at" timestamp with time zone,
    "revoked_by" uuid,
    "is_active" boolean default true
);


CREATE UNIQUE INDEX user_module_access_pkey ON public.user_module_access USING btree (id);

CREATE UNIQUE INDEX user_module_access_user_id_module_id_key ON public.user_module_access USING btree (user_id, module_id);

alter table "public"."user_module_access" add constraint "user_module_access_pkey" PRIMARY KEY using index "user_module_access_pkey";

alter table "public"."user_module_access" add constraint "user_module_access_granted_by_fkey" FOREIGN KEY (granted_by) REFERENCES users(id) not valid;

alter table "public"."user_module_access" validate constraint "user_module_access_granted_by_fkey";

alter table "public"."user_module_access" add constraint "user_module_access_module_id_fkey" FOREIGN KEY (module_id) REFERENCES app_modules(id) ON DELETE CASCADE not valid;

alter table "public"."user_module_access" validate constraint "user_module_access_module_id_fkey";

alter table "public"."user_module_access" add constraint "user_module_access_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."user_module_access" validate constraint "user_module_access_organization_id_fkey";

alter table "public"."user_module_access" add constraint "user_module_access_revoked_by_fkey" FOREIGN KEY (revoked_by) REFERENCES users(id) not valid;

alter table "public"."user_module_access" validate constraint "user_module_access_revoked_by_fkey";

alter table "public"."user_module_access" add constraint "user_module_access_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."user_module_access" validate constraint "user_module_access_user_id_fkey";

alter table "public"."user_module_access" add constraint "user_module_access_user_id_module_id_key" UNIQUE using index "user_module_access_user_id_module_id_key";

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

grant delete on table "public"."user_module_access" to "anon";

grant insert on table "public"."user_module_access" to "anon";

grant references on table "public"."user_module_access" to "anon";

grant select on table "public"."user_module_access" to "anon";

grant trigger on table "public"."user_module_access" to "anon";

grant truncate on table "public"."user_module_access" to "anon";

grant update on table "public"."user_module_access" to "anon";

grant delete on table "public"."user_module_access" to "authenticated";

grant insert on table "public"."user_module_access" to "authenticated";

grant references on table "public"."user_module_access" to "authenticated";

grant select on table "public"."user_module_access" to "authenticated";

grant trigger on table "public"."user_module_access" to "authenticated";

grant truncate on table "public"."user_module_access" to "authenticated";

grant update on table "public"."user_module_access" to "authenticated";

grant delete on table "public"."user_module_access" to "postgres";

grant insert on table "public"."user_module_access" to "postgres";

grant references on table "public"."user_module_access" to "postgres";

grant select on table "public"."user_module_access" to "postgres";

grant trigger on table "public"."user_module_access" to "postgres";

grant truncate on table "public"."user_module_access" to "postgres";

grant update on table "public"."user_module_access" to "postgres";

grant delete on table "public"."user_module_access" to "service_role";

grant insert on table "public"."user_module_access" to "service_role";

grant references on table "public"."user_module_access" to "service_role";

grant select on table "public"."user_module_access" to "service_role";

grant trigger on table "public"."user_module_access" to "service_role";

grant truncate on table "public"."user_module_access" to "service_role";

grant update on table "public"."user_module_access" to "service_role";


