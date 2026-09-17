create sequence "public"."app_modules_id_seq";

create table "public"."app_modules" (
    "id" integer not null default nextval('app_modules_id_seq'::regclass),
    "code" text not null,
    "name" text not null,
    "description" text,
    "base_path" text not null,
    "is_active" boolean default true,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);

alter sequence "public"."app_modules_id_seq" owned by "public"."app_modules"."id";

CREATE UNIQUE INDEX app_modules_code_key ON public.app_modules USING btree (code);

CREATE UNIQUE INDEX app_modules_pkey ON public.app_modules USING btree (id);

alter table "public"."app_modules" add constraint "app_modules_pkey" PRIMARY KEY using index "app_modules_pkey";

alter table "public"."app_modules" add constraint "app_modules_code_key" UNIQUE using index "app_modules_code_key";

grant references on table "public"."app_modules" to "authenticated";

grant select on table "public"."app_modules" to "authenticated";

grant delete on table "public"."app_modules" to "postgres";

grant insert on table "public"."app_modules" to "postgres";

grant references on table "public"."app_modules" to "postgres";

grant select on table "public"."app_modules" to "postgres";

grant trigger on table "public"."app_modules" to "postgres";

grant truncate on table "public"."app_modules" to "postgres";

grant update on table "public"."app_modules" to "postgres";

grant delete on table "public"."app_modules" to "service_role";

grant insert on table "public"."app_modules" to "service_role";

grant references on table "public"."app_modules" to "service_role";

grant select on table "public"."app_modules" to "service_role";

grant trigger on table "public"."app_modules" to "service_role";

grant truncate on table "public"."app_modules" to "service_role";

grant update on table "public"."app_modules" to "service_role";


