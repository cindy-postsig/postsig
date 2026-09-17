create sequence "public"."chat_messages_id_seq";

create sequence "public"."chat_sessions_id_seq";

create table "public"."chat_messages" (
    "id" bigint not null default nextval('chat_messages_id_seq'::regclass),
    "session_id" bigint not null,
    "role" text not null,
    "content" text not null,
    "metadata" jsonb,
    "created_at" timestamp with time zone not null default now()
);


alter table "public"."chat_messages" enable row level security;

create table "public"."chat_sessions" (
    "id" bigint not null default nextval('chat_sessions_id_seq'::regclass),
    "organization_id" uuid not null,
    "user_id" uuid not null,
    "title" text not null default 'New Chat'::text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."chat_sessions" enable row level security;

alter sequence "public"."chat_messages_id_seq" owned by "public"."chat_messages"."id";

alter sequence "public"."chat_sessions_id_seq" owned by "public"."chat_sessions"."id";

CREATE UNIQUE INDEX chat_messages_pkey ON public.chat_messages USING btree (id);

CREATE UNIQUE INDEX chat_sessions_pkey ON public.chat_sessions USING btree (id);

CREATE INDEX idx_chat_messages_created_at ON public.chat_messages USING btree (session_id, created_at);

CREATE INDEX idx_chat_messages_session_id ON public.chat_messages USING btree (session_id);

CREATE INDEX idx_chat_sessions_created_at ON public.chat_sessions USING btree (created_at DESC);

CREATE INDEX idx_chat_sessions_organization_id ON public.chat_sessions USING btree (organization_id);

CREATE INDEX idx_chat_sessions_user_id ON public.chat_sessions USING btree (user_id);

alter table "public"."chat_messages" add constraint "chat_messages_pkey" PRIMARY KEY using index "chat_messages_pkey";

alter table "public"."chat_sessions" add constraint "chat_sessions_pkey" PRIMARY KEY using index "chat_sessions_pkey";

alter table "public"."chat_messages" add constraint "chat_messages_role_check" CHECK ((role = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text]))) not valid;

alter table "public"."chat_messages" validate constraint "chat_messages_role_check";

alter table "public"."chat_messages" add constraint "chat_messages_session_id_fkey" FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE not valid;

alter table "public"."chat_messages" validate constraint "chat_messages_session_id_fkey";

alter table "public"."chat_sessions" add constraint "chat_sessions_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."chat_sessions" validate constraint "chat_sessions_organization_id_fkey";

alter table "public"."chat_sessions" add constraint "chat_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."chat_sessions" validate constraint "chat_sessions_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.update_chat_sessions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$function$
;

grant delete on table "public"."chat_messages" to "anon";

grant insert on table "public"."chat_messages" to "anon";

grant references on table "public"."chat_messages" to "anon";

grant select on table "public"."chat_messages" to "anon";

grant trigger on table "public"."chat_messages" to "anon";

grant truncate on table "public"."chat_messages" to "anon";

grant update on table "public"."chat_messages" to "anon";

grant delete on table "public"."chat_messages" to "authenticated";

grant insert on table "public"."chat_messages" to "authenticated";

grant references on table "public"."chat_messages" to "authenticated";

grant select on table "public"."chat_messages" to "authenticated";

grant trigger on table "public"."chat_messages" to "authenticated";

grant truncate on table "public"."chat_messages" to "authenticated";

grant update on table "public"."chat_messages" to "authenticated";

grant delete on table "public"."chat_messages" to "postgres";

grant insert on table "public"."chat_messages" to "postgres";

grant references on table "public"."chat_messages" to "postgres";

grant select on table "public"."chat_messages" to "postgres";

grant trigger on table "public"."chat_messages" to "postgres";

grant truncate on table "public"."chat_messages" to "postgres";

grant update on table "public"."chat_messages" to "postgres";

grant delete on table "public"."chat_messages" to "service_role";

grant insert on table "public"."chat_messages" to "service_role";

grant references on table "public"."chat_messages" to "service_role";

grant select on table "public"."chat_messages" to "service_role";

grant trigger on table "public"."chat_messages" to "service_role";

grant truncate on table "public"."chat_messages" to "service_role";

grant update on table "public"."chat_messages" to "service_role";

grant delete on table "public"."chat_sessions" to "anon";

grant insert on table "public"."chat_sessions" to "anon";

grant references on table "public"."chat_sessions" to "anon";

grant select on table "public"."chat_sessions" to "anon";

grant trigger on table "public"."chat_sessions" to "anon";

grant truncate on table "public"."chat_sessions" to "anon";

grant update on table "public"."chat_sessions" to "anon";

grant delete on table "public"."chat_sessions" to "authenticated";

grant insert on table "public"."chat_sessions" to "authenticated";

grant references on table "public"."chat_sessions" to "authenticated";

grant select on table "public"."chat_sessions" to "authenticated";

grant trigger on table "public"."chat_sessions" to "authenticated";

grant truncate on table "public"."chat_sessions" to "authenticated";

grant update on table "public"."chat_sessions" to "authenticated";

grant delete on table "public"."chat_sessions" to "postgres";

grant insert on table "public"."chat_sessions" to "postgres";

grant references on table "public"."chat_sessions" to "postgres";

grant select on table "public"."chat_sessions" to "postgres";

grant trigger on table "public"."chat_sessions" to "postgres";

grant truncate on table "public"."chat_sessions" to "postgres";

grant update on table "public"."chat_sessions" to "postgres";

grant delete on table "public"."chat_sessions" to "service_role";

grant insert on table "public"."chat_sessions" to "service_role";

grant references on table "public"."chat_sessions" to "service_role";

grant select on table "public"."chat_sessions" to "service_role";

grant trigger on table "public"."chat_sessions" to "service_role";

grant truncate on table "public"."chat_sessions" to "service_role";

grant update on table "public"."chat_sessions" to "service_role";

create policy "chat_messages_anon_deny"
on "public"."chat_messages"
as permissive
for all
to anon
using (false);


create policy "chat_messages_delete"
on "public"."chat_messages"
as permissive
for delete
to authenticated
using ((session_id IN ( SELECT cs.id
   FROM chat_sessions cs
  WHERE ((cs.user_id = auth.uid()) AND (cs.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid())))))));


create policy "chat_messages_insert"
on "public"."chat_messages"
as permissive
for insert
to authenticated
with check ((session_id IN ( SELECT cs.id
   FROM chat_sessions cs
  WHERE ((cs.user_id = auth.uid()) AND (cs.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid())))))));


create policy "chat_messages_select"
on "public"."chat_messages"
as permissive
for select
to authenticated
using ((session_id IN ( SELECT cs.id
   FROM chat_sessions cs
  WHERE ((cs.user_id = auth.uid()) AND (cs.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid())))))));


create policy "chat_messages_update"
on "public"."chat_messages"
as permissive
for update
to authenticated
using ((session_id IN ( SELECT cs.id
   FROM chat_sessions cs
  WHERE ((cs.user_id = auth.uid()) AND (cs.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid())))))))
with check ((session_id IN ( SELECT cs.id
   FROM chat_sessions cs
  WHERE ((cs.user_id = auth.uid()) AND (cs.organization_id IN ( SELECT u.organization_id
           FROM users u
          WHERE (u.id = auth.uid())))))));


create policy "chat_sessions_anon_deny"
on "public"."chat_sessions"
as permissive
for all
to anon
using (false);


create policy "chat_sessions_delete"
on "public"."chat_sessions"
as permissive
for delete
to authenticated
using (((user_id = auth.uid()) AND (organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid())))));


create policy "chat_sessions_insert"
on "public"."chat_sessions"
as permissive
for insert
to authenticated
with check (((user_id = auth.uid()) AND (organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid())))));


create policy "chat_sessions_select"
on "public"."chat_sessions"
as permissive
for select
to authenticated
using (((user_id = auth.uid()) AND (organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid())))));


create policy "chat_sessions_update"
on "public"."chat_sessions"
as permissive
for update
to authenticated
using (((user_id = auth.uid()) AND (organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid())))))
with check (((user_id = auth.uid()) AND (organization_id IN ( SELECT u.organization_id
   FROM users u
  WHERE (u.id = auth.uid())))));

CREATE TRIGGER audit_chat_messages_trigger AFTER INSERT OR DELETE OR UPDATE ON public.chat_messages FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER audit_chat_sessions_trigger AFTER INSERT OR DELETE OR UPDATE ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

CREATE TRIGGER chat_sessions_updated_at_trigger BEFORE UPDATE ON public.chat_sessions FOR EACH ROW EXECUTE FUNCTION update_chat_sessions_updated_at();

