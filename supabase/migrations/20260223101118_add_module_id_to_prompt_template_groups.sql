alter table "public"."prompt_template_groups" add column "module_id" integer;

alter table "public"."prompt_template_groups" add constraint "prompt_template_groups_module_id_fkey" FOREIGN KEY (module_id) REFERENCES public.app_modules(id) not valid;

alter table "public"."prompt_template_groups" validate constraint "prompt_template_groups_module_id_fkey";


