create type "public"."comment_order" as enum ('newest_first', 'oldest_first');

create table "public"."contract_comments_prefs" (
    "contract_id" bigint not null,
    "user_id" uuid not null,
    "comment_order" comment_order not null default 'newest_first'::comment_order,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."contract_comments_prefs" enable row level security;

create table "public"."contract_comments_views" (
    "contract_id" bigint not null,
    "user_id" uuid not null,
    "last_viewed_at" timestamp with time zone not null default now(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
);


alter table "public"."contract_comments_views" enable row level security;

CREATE UNIQUE INDEX contract_comments_prefs_pkey ON public.contract_comments_prefs USING btree (contract_id, user_id);

CREATE UNIQUE INDEX contract_comments_views_pkey ON public.contract_comments_views USING btree (contract_id, user_id);

CREATE INDEX idx_contract_comments_prefs_user ON public.contract_comments_prefs USING btree (user_id);

CREATE INDEX idx_contract_comments_views_user ON public.contract_comments_views USING btree (user_id);

alter table "public"."contract_comments_prefs" add constraint "contract_comments_prefs_pkey" PRIMARY KEY using index "contract_comments_prefs_pkey";

alter table "public"."contract_comments_views" add constraint "contract_comments_views_pkey" PRIMARY KEY using index "contract_comments_views_pkey";

alter table "public"."contract_comments_prefs" add constraint "contract_comments_prefs_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;

alter table "public"."contract_comments_prefs" validate constraint "contract_comments_prefs_contract_id_fkey";

alter table "public"."contract_comments_prefs" add constraint "contract_comments_prefs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."contract_comments_prefs" validate constraint "contract_comments_prefs_user_id_fkey";

alter table "public"."contract_comments_views" add constraint "contract_comments_views_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE not valid;

alter table "public"."contract_comments_views" validate constraint "contract_comments_views_contract_id_fkey";

alter table "public"."contract_comments_views" add constraint "contract_comments_views_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE not valid;

alter table "public"."contract_comments_views" validate constraint "contract_comments_views_user_id_fkey";

grant delete on table "public"."contract_comments_prefs" to "anon";

grant insert on table "public"."contract_comments_prefs" to "anon";

grant references on table "public"."contract_comments_prefs" to "anon";

grant select on table "public"."contract_comments_prefs" to "anon";

grant trigger on table "public"."contract_comments_prefs" to "anon";

grant truncate on table "public"."contract_comments_prefs" to "anon";

grant update on table "public"."contract_comments_prefs" to "anon";

grant delete on table "public"."contract_comments_prefs" to "authenticated";

grant insert on table "public"."contract_comments_prefs" to "authenticated";

grant references on table "public"."contract_comments_prefs" to "authenticated";

grant select on table "public"."contract_comments_prefs" to "authenticated";

grant trigger on table "public"."contract_comments_prefs" to "authenticated";

grant truncate on table "public"."contract_comments_prefs" to "authenticated";

grant update on table "public"."contract_comments_prefs" to "authenticated";

grant delete on table "public"."contract_comments_prefs" to "service_role";

grant insert on table "public"."contract_comments_prefs" to "service_role";

grant references on table "public"."contract_comments_prefs" to "service_role";

grant select on table "public"."contract_comments_prefs" to "service_role";

grant trigger on table "public"."contract_comments_prefs" to "service_role";

grant truncate on table "public"."contract_comments_prefs" to "service_role";

grant update on table "public"."contract_comments_prefs" to "service_role";

grant delete on table "public"."contract_comments_views" to "anon";

grant insert on table "public"."contract_comments_views" to "anon";

grant references on table "public"."contract_comments_views" to "anon";

grant select on table "public"."contract_comments_views" to "anon";

grant trigger on table "public"."contract_comments_views" to "anon";

grant truncate on table "public"."contract_comments_views" to "anon";

grant update on table "public"."contract_comments_views" to "anon";

grant delete on table "public"."contract_comments_views" to "authenticated";

grant insert on table "public"."contract_comments_views" to "authenticated";

grant references on table "public"."contract_comments_views" to "authenticated";

grant select on table "public"."contract_comments_views" to "authenticated";

grant trigger on table "public"."contract_comments_views" to "authenticated";

grant truncate on table "public"."contract_comments_views" to "authenticated";

grant update on table "public"."contract_comments_views" to "authenticated";

grant delete on table "public"."contract_comments_views" to "service_role";

grant insert on table "public"."contract_comments_views" to "service_role";

grant references on table "public"."contract_comments_views" to "service_role";

grant select on table "public"."contract_comments_views" to "service_role";

grant trigger on table "public"."contract_comments_views" to "service_role";

grant truncate on table "public"."contract_comments_views" to "service_role";

grant update on table "public"."contract_comments_views" to "service_role";

create policy "contract_comments_prefs_anon_deny"
on "public"."contract_comments_prefs"
as permissive
for all
to anon
using (false);


create policy "contract_comments_prefs_insert_own"
on "public"."contract_comments_prefs"
as permissive
for insert
to authenticated
with check ((user_id = auth.uid()));


create policy "contract_comments_prefs_select"
on "public"."contract_comments_prefs"
as permissive
for select
to authenticated
using ((user_id = auth.uid()));


create policy "contract_comments_prefs_update_own"
on "public"."contract_comments_prefs"
as permissive
for update
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "contract_comments_views_anon_deny"
on "public"."contract_comments_views"
as permissive
for all
to anon
using (false);


create policy "contract_comments_views_select"
on "public"."contract_comments_views"
as permissive
for select
to authenticated
using ((user_id = auth.uid()));


create policy "contract_comments_views_update_own"
on "public"."contract_comments_views"
as permissive
for update
to authenticated
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));


create policy "contract_comments_views_upsert_own"
on "public"."contract_comments_views"
as permissive
for insert
to authenticated
with check ((user_id = auth.uid()));



