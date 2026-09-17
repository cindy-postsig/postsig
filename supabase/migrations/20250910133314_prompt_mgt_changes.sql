create table "public"."evaluation_results" (
    "id" uuid not null default gen_random_uuid(),
    "evaluation_run_id" uuid not null,
    "contract_id" integer not null,
    "prompt_template_id" text not null,
    "field_name" text not null,
    "extracted_value" text not null,
    "existing_value" text,
    "similarity_score" numeric(3,2) not null,
    "relevance_score" numeric(3,2) not null,
    "confidence_score" numeric(3,2) not null,
    "processing_time_ms" integer not null default 0,
    "created_at" timestamp with time zone default now()
);


alter table "public"."evaluation_results" enable row level security;

create table "public"."evaluation_runs" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "selected_contract_ids" integer[] not null default '{}'::integer[],
    "selected_prompt_ids" text[] not null default '{}'::text[],
    "combined_schema" jsonb not null default '{}'::jsonb,
    "gemini_model" text not null default 'gemini-1.5-flash'::text,
    "status" text not null default 'pending'::text,
    "created_at" timestamp with time zone default now(),
    "completed_at" timestamp with time zone,
    "results_summary" jsonb,
    "error_message" text,
    "user_id" uuid not null
);


alter table "public"."evaluation_runs" enable row level security;

create table "public"."extracted_data" (
    "id" uuid not null default gen_random_uuid(),
    "contract_id" integer not null,
    "extracted_fields" jsonb,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now()
);


alter table "public"."extracted_data" enable row level security;

alter table "public"."prompt_templates" add column "version_display" text;

alter table "public"."prompt_templates" add column "version_timestamp" timestamp with time zone default now();

CREATE UNIQUE INDEX evaluation_results_pkey ON public.evaluation_results USING btree (id);

CREATE UNIQUE INDEX evaluation_runs_pkey ON public.evaluation_runs USING btree (id);

CREATE UNIQUE INDEX extracted_data_pkey ON public.extracted_data USING btree (id);

CREATE INDEX idx_evaluation_results_contract_id ON public.evaluation_results USING btree (contract_id);

CREATE INDEX idx_evaluation_results_prompt_template_id ON public.evaluation_results USING btree (prompt_template_id);

CREATE INDEX idx_evaluation_results_relevance_score ON public.evaluation_results USING btree (relevance_score DESC);

CREATE INDEX idx_evaluation_results_run_id ON public.evaluation_results USING btree (evaluation_run_id);

CREATE INDEX idx_evaluation_results_similarity_score ON public.evaluation_results USING btree (similarity_score DESC);

CREATE INDEX idx_evaluation_runs_created_at ON public.evaluation_runs USING btree (created_at DESC);

CREATE INDEX idx_evaluation_runs_status ON public.evaluation_runs USING btree (status);

CREATE INDEX idx_evaluation_runs_user_id ON public.evaluation_runs USING btree (user_id);

CREATE INDEX idx_extracted_data_contract_id ON public.extracted_data USING btree (contract_id);

alter table "public"."evaluation_results" add constraint "evaluation_results_pkey" PRIMARY KEY using index "evaluation_results_pkey";

alter table "public"."evaluation_runs" add constraint "evaluation_runs_pkey" PRIMARY KEY using index "evaluation_runs_pkey";

alter table "public"."extracted_data" add constraint "extracted_data_pkey" PRIMARY KEY using index "extracted_data_pkey";

alter table "public"."evaluation_results" add constraint "evaluation_results_confidence_score_check" CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (1)::numeric))) not valid;

alter table "public"."evaluation_results" validate constraint "evaluation_results_confidence_score_check";

alter table "public"."evaluation_results" add constraint "evaluation_results_evaluation_run_id_fkey" FOREIGN KEY (evaluation_run_id) REFERENCES evaluation_runs(id) ON DELETE CASCADE not valid;

alter table "public"."evaluation_results" validate constraint "evaluation_results_evaluation_run_id_fkey";

alter table "public"."evaluation_results" add constraint "evaluation_results_relevance_score_check" CHECK (((relevance_score >= (0)::numeric) AND (relevance_score <= (1)::numeric))) not valid;

alter table "public"."evaluation_results" validate constraint "evaluation_results_relevance_score_check";

alter table "public"."evaluation_results" add constraint "evaluation_results_similarity_score_check" CHECK (((similarity_score >= (0)::numeric) AND (similarity_score <= (1)::numeric))) not valid;

alter table "public"."evaluation_results" validate constraint "evaluation_results_similarity_score_check";

alter table "public"."evaluation_runs" add constraint "evaluation_runs_gemini_model_check" CHECK ((gemini_model = ANY (ARRAY['gemini-1.5-pro'::text, 'gemini-1.5-flash'::text]))) not valid;

alter table "public"."evaluation_runs" validate constraint "evaluation_runs_gemini_model_check";

alter table "public"."evaluation_runs" add constraint "evaluation_runs_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'running'::text, 'completed'::text, 'failed'::text]))) not valid;

alter table "public"."evaluation_runs" validate constraint "evaluation_runs_status_check";

alter table "public"."evaluation_runs" add constraint "evaluation_runs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."evaluation_runs" validate constraint "evaluation_runs_user_id_fkey";

alter table "public"."extracted_data" add constraint "extracted_data_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;

alter table "public"."extracted_data" validate constraint "extracted_data_contract_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_prompt_version_timestamp()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  base_timestamp TIMESTAMP WITH TIME ZONE;
  final_timestamp TIMESTAMP WITH TIME ZONE;
  collision_count INTEGER := 0;
  display_version TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    base_timestamp = NOW();
    final_timestamp = base_timestamp;
    
    -- Check for collisions within the same prompt group
    WHILE EXISTS (
      SELECT 1 FROM prompt_templates 
      WHERE prompt_group_id = NEW.prompt_group_id 
      AND version_timestamp = final_timestamp
    ) LOOP
      collision_count = collision_count + 1;
      final_timestamp = base_timestamp + (collision_count * INTERVAL '1 microsecond');
    END LOOP;
    
    NEW.version_timestamp = final_timestamp;
    
    -- Generate display version in UTC
    display_version = TO_CHAR(final_timestamp AT TIME ZONE 'UTC', 'YYYY.MM.DD.HH24MI');
    
    -- Add suffix if there was a collision
    IF collision_count > 0 THEN
      display_version = display_version || '.' || collision_count;
    END IF;
    
    NEW.version_display = display_version;
  END IF;
  
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."evaluation_results" to "anon";

grant insert on table "public"."evaluation_results" to "anon";

grant references on table "public"."evaluation_results" to "anon";

grant select on table "public"."evaluation_results" to "anon";

grant trigger on table "public"."evaluation_results" to "anon";

grant truncate on table "public"."evaluation_results" to "anon";

grant update on table "public"."evaluation_results" to "anon";

grant delete on table "public"."evaluation_results" to "authenticated";

grant insert on table "public"."evaluation_results" to "authenticated";

grant references on table "public"."evaluation_results" to "authenticated";

grant select on table "public"."evaluation_results" to "authenticated";

grant trigger on table "public"."evaluation_results" to "authenticated";

grant truncate on table "public"."evaluation_results" to "authenticated";

grant update on table "public"."evaluation_results" to "authenticated";

grant delete on table "public"."evaluation_results" to "service_role";

grant insert on table "public"."evaluation_results" to "service_role";

grant references on table "public"."evaluation_results" to "service_role";

grant select on table "public"."evaluation_results" to "service_role";

grant trigger on table "public"."evaluation_results" to "service_role";

grant truncate on table "public"."evaluation_results" to "service_role";

grant update on table "public"."evaluation_results" to "service_role";

grant delete on table "public"."evaluation_runs" to "anon";

grant insert on table "public"."evaluation_runs" to "anon";

grant references on table "public"."evaluation_runs" to "anon";

grant select on table "public"."evaluation_runs" to "anon";

grant trigger on table "public"."evaluation_runs" to "anon";

grant truncate on table "public"."evaluation_runs" to "anon";

grant update on table "public"."evaluation_runs" to "anon";

grant delete on table "public"."evaluation_runs" to "authenticated";

grant insert on table "public"."evaluation_runs" to "authenticated";

grant references on table "public"."evaluation_runs" to "authenticated";

grant select on table "public"."evaluation_runs" to "authenticated";

grant trigger on table "public"."evaluation_runs" to "authenticated";

grant truncate on table "public"."evaluation_runs" to "authenticated";

grant update on table "public"."evaluation_runs" to "authenticated";

grant delete on table "public"."evaluation_runs" to "service_role";

grant insert on table "public"."evaluation_runs" to "service_role";

grant references on table "public"."evaluation_runs" to "service_role";

grant select on table "public"."evaluation_runs" to "service_role";

grant trigger on table "public"."evaluation_runs" to "service_role";

grant truncate on table "public"."evaluation_runs" to "service_role";

grant update on table "public"."evaluation_runs" to "service_role";

grant delete on table "public"."extracted_data" to "anon";

grant insert on table "public"."extracted_data" to "anon";

grant references on table "public"."extracted_data" to "anon";

grant select on table "public"."extracted_data" to "anon";

grant trigger on table "public"."extracted_data" to "anon";

grant truncate on table "public"."extracted_data" to "anon";

grant update on table "public"."extracted_data" to "anon";

grant delete on table "public"."extracted_data" to "authenticated";

grant insert on table "public"."extracted_data" to "authenticated";

grant references on table "public"."extracted_data" to "authenticated";

grant select on table "public"."extracted_data" to "authenticated";

grant trigger on table "public"."extracted_data" to "authenticated";

grant truncate on table "public"."extracted_data" to "authenticated";

grant update on table "public"."extracted_data" to "authenticated";

grant delete on table "public"."extracted_data" to "service_role";

grant insert on table "public"."extracted_data" to "service_role";

grant references on table "public"."extracted_data" to "service_role";

grant select on table "public"."extracted_data" to "service_role";

grant trigger on table "public"."extracted_data" to "service_role";

grant truncate on table "public"."extracted_data" to "service_role";

grant update on table "public"."extracted_data" to "service_role";

create policy "Users can delete evaluation results for their runs"
on "public"."evaluation_results"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM evaluation_runs
  WHERE ((evaluation_runs.id = evaluation_results.evaluation_run_id) AND (evaluation_runs.user_id = auth.uid())))));


create policy "Users can insert evaluation results for their runs"
on "public"."evaluation_results"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM evaluation_runs
  WHERE ((evaluation_runs.id = evaluation_results.evaluation_run_id) AND (evaluation_runs.user_id = auth.uid())))));


create policy "Users can update evaluation results for their runs"
on "public"."evaluation_results"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM evaluation_runs
  WHERE ((evaluation_runs.id = evaluation_results.evaluation_run_id) AND (evaluation_runs.user_id = auth.uid())))));


create policy "Users can view evaluation results for their runs"
on "public"."evaluation_results"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM evaluation_runs
  WHERE ((evaluation_runs.id = evaluation_results.evaluation_run_id) AND (evaluation_runs.user_id = auth.uid())))));


create policy "Users can delete own evaluation runs"
on "public"."evaluation_runs"
as permissive
for delete
to public
using ((auth.uid() = user_id));


create policy "Users can insert own evaluation runs"
on "public"."evaluation_runs"
as permissive
for insert
to public
with check ((auth.uid() = user_id));


create policy "Users can update own evaluation runs"
on "public"."evaluation_runs"
as permissive
for update
to public
using ((auth.uid() = user_id));


create policy "Users can view own evaluation runs"
on "public"."evaluation_runs"
as permissive
for select
to public
using ((auth.uid() = user_id));


create policy "Users can delete extracted data for their contracts"
on "public"."extracted_data"
as permissive
for delete
to public
using ((EXISTS ( SELECT 1
   FROM contracts
  WHERE ((contracts.id = extracted_data.contract_id) AND (contracts.user_id = auth.uid())))));


create policy "Users can insert extracted data for their contracts"
on "public"."extracted_data"
as permissive
for insert
to public
with check ((EXISTS ( SELECT 1
   FROM contracts
  WHERE ((contracts.id = extracted_data.contract_id) AND (contracts.user_id = auth.uid())))));


create policy "Users can update extracted data for their contracts"
on "public"."extracted_data"
as permissive
for update
to public
using ((EXISTS ( SELECT 1
   FROM contracts
  WHERE ((contracts.id = extracted_data.contract_id) AND (contracts.user_id = auth.uid())))));


create policy "Users can view extracted data for their contracts"
on "public"."extracted_data"
as permissive
for select
to public
using ((EXISTS ( SELECT 1
   FROM contracts
  WHERE ((contracts.id = extracted_data.contract_id) AND (contracts.user_id = auth.uid())))));


CREATE TRIGGER prompt_version_auto_timestamp BEFORE INSERT ON public.prompt_templates FOR EACH ROW EXECUTE FUNCTION set_prompt_version_timestamp();


