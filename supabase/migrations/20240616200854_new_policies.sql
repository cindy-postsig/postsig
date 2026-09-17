drop policy "Enable insert for authenticated users only" on "public"."contract_docs";

drop policy "Enable insert for extractors" on "public"."contract_docs";

drop policy "Give access to contract_docs for all extractors 2" on "public"."contract_docs";

drop policy "Users can select their own contract documents" on "public"."contract_docs";

drop policy "Allow authorized insert access" on "public"."contracts";

drop policy "Allow authorized select access based on role permissions" on "public"."contracts";

drop policy "Enable read access for all users" on "public"."contracts";

drop policy "Enable update for extractors based on email" on "public"."contracts";

drop policy "Enable users to update their own contracts" on "public"."contracts";

drop policy "Give full access to extractors" on "public"."contracts";

drop policy "Users can insert into contracts" on "public"."contracts";

drop policy "Users can view their own contracts" on "public"."contracts";

drop policy "Enable select for authenticated users only" on "public"."user_roles2";

drop policy "Allow authorized delete access" on "public"."vendor_products";

drop policy "Allow authorized insert access" on "public"."vendor_products";

drop policy "Allow authorized select access" on "public"."vendor_products";

drop policy "Allow authorized update access" on "public"."vendor_products";

drop policy "Allow authorized delete access" on "public"."vendor_products_details";

drop policy "Allow authorized insert access" on "public"."vendor_products_details";

drop policy "Allow authorized select access" on "public"."vendor_products_details";

drop policy "Allow authorized update access" on "public"."vendor_products_details";

drop policy "Enable insert for authenticated users only" on "public"."vendors";

drop policy "Enable insert for extractors" on "public"."vendors";

drop policy "Enable select for authenticated users only" on "public"."vendors";

drop policy "Enable update for authenticated users only" on "public"."vendors";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.create_user_and_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  -- Insert into public.users
  INSERT INTO public.users (id, name, email, job_title, organization, department)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'name',
    NEW.email,
    NEW.raw_user_meta_data ->> 'job_title',
    NEW.raw_user_meta_data ->> 'organization',
    NEW.raw_user_meta_data ->> 'department'
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

    RETURN NEW;
  END;
  $function$
;

create policy "User can see their own rows"
on "public"."contract_docs"
as permissive
for select
to public
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can create a row"
on "public"."contract_docs"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can update their own rows"
on "public"."contract_docs"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "User can see their own rows"
on "public"."contracts"
as permissive
for select
to public
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can create a row"
on "public"."contracts"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can update their own rows"
on "public"."contracts"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "User can see their own rows"
on "public"."user_roles2"
as permissive
for select
to public
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can create a row"
on "public"."user_roles2"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can update their own rows"
on "public"."user_roles2"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "User can see their own rows"
on "public"."vendor_products"
as permissive
for select
to public
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can create a row"
on "public"."vendor_products"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can update their own rows"
on "public"."vendor_products"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "User can see their own rows"
on "public"."vendor_products_details"
as permissive
for select
to public
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can create a row"
on "public"."vendor_products_details"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can update their own rows"
on "public"."vendor_products_details"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "User can see their own rows"
on "public"."vendors"
as permissive
for select
to public
using ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can create a row"
on "public"."vendors"
as permissive
for insert
to authenticated
with check ((( SELECT auth.uid() AS uid) = user_id));


create policy "Users can update their own rows"
on "public"."vendors"
as permissive
for update
to authenticated
using ((( SELECT auth.uid() AS uid) = user_id))
with check ((( SELECT auth.uid() AS uid) = user_id));



