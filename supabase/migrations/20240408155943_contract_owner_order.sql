alter table "public"."contracts" add column "business_order" text;

set check_function_bodies = off;

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
