-- Add prompt_template_group_id foreign key to master_field_definitions table

alter table "public"."master_field_definitions" add column "prompt_template_group_id" uuid;

alter table "public"."master_field_definitions" add constraint "master_field_definitions_prompt_template_group_id_fkey" FOREIGN KEY (prompt_template_group_id) REFERENCES public.prompt_template_groups(id) not valid;

alter table "public"."master_field_definitions" validate constraint "master_field_definitions_prompt_template_group_id_fkey";
