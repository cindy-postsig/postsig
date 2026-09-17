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

  -- Insert into public.user_roles with condition on email domain
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


