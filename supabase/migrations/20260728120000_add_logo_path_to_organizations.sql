alter table "public"."organizations"
add column "logo_path" text;

comment on column "public"."organizations"."logo_path" is
  'Path to the organization logo object in the public logos storage bucket.';
