create sequence "public"."activities_id_seq";

create table "public"."activities" (
    "id" integer not null default nextval('activities_id_seq' :: regclass),
    "contract_id" integer,
    "user_id" uuid,
    "activity_type" character varying(50),
    "activity_data" character varying(255),
    "created_at" timestamp without time zone default now(),
    "user_name" text
);

alter table
    "public"."activities" enable row level security;

alter table
    "public"."contracts"
alter column
    "updated_at"
set
    data type timestamp with time zone using "updated_at" :: timestamp with time zone;

alter table
    "public"."vendors" disable row level security;

alter sequence "public"."activities_id_seq" owned by "public"."activities"."id";

CREATE UNIQUE INDEX activities_pkey ON public.activities USING btree (id);

alter table
    "public"."activities"
add
    constraint "activities_pkey" PRIMARY KEY using index "activities_pkey";

alter table
    "public"."activities"
add
    constraint "activities_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) not valid;

alter table
    "public"."activities" validate constraint "activities_contract_id_fkey";

alter table
    "public"."activities"
add
    constraint "activities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table
    "public"."activities" validate constraint "activities_user_id_fkey";

grant delete on table "public"."activities" to "anon";

grant
insert
    on table "public"."activities" to "anon";

grant references on table "public"."activities" to "anon";

grant
select
    on table "public"."activities" to "anon";

grant trigger on table "public"."activities" to "anon";

grant truncate on table "public"."activities" to "anon";

grant
update
    on table "public"."activities" to "anon";

grant delete on table "public"."activities" to "authenticated";

grant
insert
    on table "public"."activities" to "authenticated";

grant references on table "public"."activities" to "authenticated";

grant
select
    on table "public"."activities" to "authenticated";

grant trigger on table "public"."activities" to "authenticated";

grant truncate on table "public"."activities" to "authenticated";

grant
update
    on table "public"."activities" to "authenticated";

grant delete on table "public"."activities" to "service_role";

grant
insert
    on table "public"."activities" to "service_role";

grant references on table "public"."activities" to "service_role";

grant
select
    on table "public"."activities" to "service_role";

grant trigger on table "public"."activities" to "service_role";

grant truncate on table "public"."activities" to "service_role";

grant
update
    on table "public"."activities" to "service_role";

create policy "Enable insert for authenticated users only" on "public"."activities" as permissive for
insert
    to authenticated with check (true);

create policy "Users can view their own activity" on "public"."activities" as permissive for
select
    to authenticated using ((user_id = auth.uid()));

create policy "Enable read access for all users" on "public"."contracts" as permissive for
select
    to authenticated using ((auth.uid() = user_id));