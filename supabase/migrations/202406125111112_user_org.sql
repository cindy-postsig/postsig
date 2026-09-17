create sequence "public"."user_roles2_id_seq";


create table "public"."organizations" (
    "id" uuid not null default uuid_generate_v4(),
    "name" text not null
);

alter table "public"."organizations" enable row level security;

create table "public"."roles" (
    "id" integer not null,
    "name" text not null
);

alter table "public"."roles" enable row level security;

create table "public"."user_roles2" (
    "user_id" uuid not null,
    "role_id" integer not null,
    "id" integer not null default nextval('user_roles2_id_seq'::regclass)
);

alter table "public"."users" add column "organization_id" uuid;

alter sequence "public"."user_roles2_id_seq" owned by "public"."user_roles2"."id";

CREATE UNIQUE INDEX organizations_pkey ON public.organizations USING btree (id);

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id);

CREATE UNIQUE INDEX user_roles2_id_key ON public.user_roles2 USING btree (id);

CREATE UNIQUE INDEX user_roles2_pkey ON public.user_roles2 USING btree (user_id, role_id);

alter table "public"."organizations" add constraint "organizations_pkey" PRIMARY KEY using index "organizations_pkey";

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."user_roles2" add constraint "user_roles2_pkey" PRIMARY KEY using index "user_roles2_pkey";

alter table "public"."user_roles2" add constraint "user_roles2_id_key" UNIQUE using index "user_roles2_id_key";

alter table "public"."user_roles2" add constraint "user_roles2_role_id_fkey" FOREIGN KEY (role_id) REFERENCES roles(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."user_roles2" validate constraint "user_roles2_role_id_fkey";

alter table "public"."user_roles2" add constraint "user_roles2_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."user_roles2" validate constraint "user_roles2_user_id_fkey";

alter table "public"."users" add constraint "users_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) not valid;

alter table "public"."users" validate constraint "users_organization_id_fkey";


alter table "public"."user_roles2" enable row level security;

create policy "Select for authenticated"
on "public"."roles"
as permissive
for select
to authenticated
using (true);

create policy "Enable select for authenticated users only"
on "public"."user_roles2"
as permissive
for select
to authenticated
using (true);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_auth_user_organization_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
  BEGIN
    IF NEW.organization_id IS NOT NULL THEN
      UPDATE auth.users
      SET raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{organization_id}',
        to_jsonb(NEW.organization_id::text),
        true
      )
      WHERE id = NEW.id;
    END IF;

    IF NEW.organization_id IS NULL THEN
      UPDATE auth.users
      SET raw_user_meta_data = jsonb_set(
        coalesce(raw_user_meta_data, '{}'::jsonb),
        '{organization_id}',
        to_jsonb(false),
        true
      )
      WHERE id = NEW.id;
    END IF;



    RETURN NEW;
  END;
  $function$
;

CREATE OR REPLACE FUNCTION public.create_user_and_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Insert into public.users
  INSERT INTO public.users (id, name, email, job_title, organization, department, organization_id)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'job_title',
    NEW.raw_user_meta_data ->> 'organization',
    NEW.raw_user_meta_data ->> 'department',
    false
  );

  -- Check email domain and assign appropriate role
  IF NEW.email LIKE '%@postsig.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (
      NEW.id,
      'admin'
    );
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (
      NEW.id,
      'user'
    );
  END IF;

  -- Update auth.users to set show_ftux to true
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'::jsonb),
    '{show_ftux}',
    'true'::jsonb,
    true
  )
  WHERE id = NEW.id;

  -- Update auth.users to set accepted_terms to false
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    coalesce(raw_user_meta_data, '{}'::jsonb),
    '{accepted_terms}',
    'false'::jsonb,
    true
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$function$
;

create policy "Enable select for authenticated users only"
on "public"."organizations"
as permissive
for select
to authenticated
using (true);


CREATE TRIGGER update_auth_user_organization_id AFTER UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION update_auth_user_organization_id();
