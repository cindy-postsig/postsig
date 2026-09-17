create table "public"."users" (
  "id" uuid not null,
  "updated_at" timestamp with time zone,
  "email" text,
  "name" text,
  "job_title" text,
  "organization" text,
  "department" text
);

alter table
  "public"."users" enable row level security;

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id);

alter table
  "public"."users"
add
  constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table
  "public"."users"
add
  constraint "users_email_key" UNIQUE using index "users_email_key";

alter table
  "public"."users"
add
  constraint "users_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table
  "public"."users" validate constraint "users_id_fkey";

set
  check_function_bodies = off;

  CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  BEGIN
    INSERT INTO public.users (
      id,
      name,
      email,
      job_title,
      organization,
      department
    )
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data->>'name',
      NEW.email,
      NEW.raw_user_meta_data->>'job_title',
      NEW.raw_user_meta_data->>'organization',
      NEW.raw_user_meta_data->>'department'
    );

    RETURN NEW;
  END;
  $$;

grant delete on table "public"."users" to "anon";

grant
insert
  on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant
select
  on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant
update
  on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant
insert
  on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant
select
  on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant
update
  on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant
insert
  on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant
select
  on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant
update
  on table "public"."users" to "service_role";

create policy "Public users are viewable by everyone." on "public"."users" as permissive for
select
  to public using (true);

create policy "Users can insert their own profile." on "public"."users" as permissive for
insert
  to public with check ((auth.uid() = id));

create policy "Users can update own profile." on "public"."users" as permissive for
update
  to public using ((auth.uid() = id));
