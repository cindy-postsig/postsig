create sequence "public"."contract_associations_id_seq";

create table "public"."contract_associations" (
    "id" integer not null default nextval('contract_associations_id_seq'::regclass),
    "parent_contract_id" integer,
    "child_contract_id" integer,
    "created_at" timestamp without time zone default CURRENT_TIMESTAMP
);


alter table "public"."contracts" drop column "associated_contract_ids";

alter sequence "public"."contract_associations_id_seq" owned by "public"."contract_associations"."id";

CREATE UNIQUE INDEX contract_associations_parent_contract_id_child_contract_id_key ON public.contract_associations USING btree (parent_contract_id, child_contract_id);

CREATE UNIQUE INDEX contract_associations_pkey ON public.contract_associations USING btree (id);

alter table "public"."contract_associations" add constraint "contract_associations_pkey" PRIMARY KEY using index "contract_associations_pkey";

alter table "public"."contract_associations" add constraint "contract_associations_child_contract_id_fkey" FOREIGN KEY (child_contract_id) REFERENCES contracts(id) not valid;

alter table "public"."contract_associations" validate constraint "contract_associations_child_contract_id_fkey";

alter table "public"."contract_associations" add constraint "contract_associations_parent_contract_id_child_contract_id_key" UNIQUE using index "contract_associations_parent_contract_id_child_contract_id_key";

alter table "public"."contract_associations" add constraint "contract_associations_parent_contract_id_fkey" FOREIGN KEY (parent_contract_id) REFERENCES contracts(id) not valid;

alter table "public"."contract_associations" validate constraint "contract_associations_parent_contract_id_fkey";

grant delete on table "public"."contract_associations" to "anon";

grant insert on table "public"."contract_associations" to "anon";

grant references on table "public"."contract_associations" to "anon";

grant select on table "public"."contract_associations" to "anon";

grant trigger on table "public"."contract_associations" to "anon";

grant truncate on table "public"."contract_associations" to "anon";

grant update on table "public"."contract_associations" to "anon";

grant delete on table "public"."contract_associations" to "authenticated";

grant insert on table "public"."contract_associations" to "authenticated";

grant references on table "public"."contract_associations" to "authenticated";

grant select on table "public"."contract_associations" to "authenticated";

grant trigger on table "public"."contract_associations" to "authenticated";

grant truncate on table "public"."contract_associations" to "authenticated";

grant update on table "public"."contract_associations" to "authenticated";

grant delete on table "public"."contract_associations" to "service_role";

grant insert on table "public"."contract_associations" to "service_role";

grant references on table "public"."contract_associations" to "service_role";

grant select on table "public"."contract_associations" to "service_role";

grant trigger on table "public"."contract_associations" to "service_role";

grant truncate on table "public"."contract_associations" to "service_role";

grant update on table "public"."contract_associations" to "service_role";
