-- Drop the function with CASCADE to remove dependencies
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

-- Define the function with SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.create_user_and_roles()
RETURNS TRIGGER AS $$
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

  -- Insert into public.user_roles
  INSERT INTO public.user_roles (user_id, role)
    VALUES (
      NEW.id,
      'admin'
    );

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
CREATE TRIGGER after_user_insert
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_user_and_roles();
