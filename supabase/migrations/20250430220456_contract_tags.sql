create table "public"."user_tags" (
    "id" SERIAL PRIMARY KEY,
    "name" text not null,
    "org_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "updated_at" timestamp with time zone default now(),
    UNIQUE(name, org_id)
);

create table "public"."contract_tags" (
    "id" SERIAL PRIMARY KEY,
    "contract_id" integer not null,
    "tag_id" integer not null,
    "created_at" timestamp with time zone default now(),
    UNIQUE(contract_id, tag_id)
);

CREATE INDEX idx_contract_tags_contract_id ON public.contract_tags USING btree (contract_id);
CREATE INDEX idx_contract_tags_tag_id ON public.contract_tags USING btree (tag_id);
CREATE INDEX idx_user_tags_org_id ON public.user_tags USING btree (org_id);

alter table "public"."contract_tags" add constraint "contract_tags_contract_id_fkey" FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE;
alter table "public"."contract_tags" add constraint "contract_tags_tag_id_fkey" FOREIGN KEY (tag_id) REFERENCES user_tags(id) ON DELETE CASCADE;
alter table "public"."user_tags" add constraint "user_tags_org_id_fkey" FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

grant delete on table "public"."contract_tags" to "authenticated";
grant insert on table "public"."contract_tags" to "authenticated";
grant references on table "public"."contract_tags" to "authenticated";
grant select on table "public"."contract_tags" to "authenticated";
grant trigger on table "public"."contract_tags" to "authenticated";
grant truncate on table "public"."contract_tags" to "authenticated";
grant update on table "public"."contract_tags" to "authenticated";

grant delete on table "public"."contract_tags" to "service_role";
grant insert on table "public"."contract_tags" to "service_role";
grant references on table "public"."contract_tags" to "service_role";
grant select on table "public"."contract_tags" to "service_role";
grant trigger on table "public"."contract_tags" to "service_role";
grant truncate on table "public"."contract_tags" to "service_role";
grant update on table "public"."contract_tags" to "service_role";

grant delete on table "public"."user_tags" to "authenticated";
grant insert on table "public"."user_tags" to "authenticated";
grant references on table "public"."user_tags" to "authenticated";
grant select on table "public"."user_tags" to "authenticated";
grant trigger on table "public"."user_tags" to "authenticated";
grant truncate on table "public"."user_tags" to "authenticated";
grant update on table "public"."user_tags" to "authenticated";

grant delete on table "public"."user_tags" to "service_role";
grant insert on table "public"."user_tags" to "service_role";
grant references on table "public"."user_tags" to "service_role";
grant select on table "public"."user_tags" to "service_role";
grant trigger on table "public"."user_tags" to "service_role";
grant truncate on table "public"."user_tags" to "service_role";
grant update on table "public"."user_tags" to "service_role";

create policy "Enable insert for authenticated users only"
on "public"."user_tags"
as permissive
for insert
to authenticated
with check (true);

create policy "Enable read access for all users"
on "public"."user_tags"
as permissive
for select
to authenticated
using (true);

create policy "Enable insert for authenticated users only"
on "public"."contract_tags"
as permissive
for insert
to authenticated
with check (true);

create policy "Enable read access for all users"
on "public"."contract_tags"
as permissive
for select
to authenticated
using (true);
