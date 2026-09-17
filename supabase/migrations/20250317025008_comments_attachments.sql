create sequence "public"."contract_comments_attachments_id_seq";

create table "public"."contract_comments_attachments" (
    "id" integer not null default nextval('contract_comments_attachments_id_seq'::regclass),
    "file_path" text not null,
    "file_name" text not null,
    "file_type" text not null,
    "file_size" integer not null,
    "comment_id" integer,
    "user_id" uuid not null,
    "created_at" timestamp with time zone default now(),
    "public_url" text,
    "organization_id" uuid
);

alter sequence "public"."contract_comments_attachments_id_seq" owned by "public"."contract_comments_attachments"."id";

CREATE UNIQUE INDEX contract_comments_attachments_pkey ON public.contract_comments_attachments USING btree (id);

CREATE INDEX idx_contract_comments_attachments_comment_id ON public.contract_comments_attachments USING btree (comment_id);

CREATE INDEX idx_contract_comments_attachments_user_id ON public.contract_comments_attachments USING btree (user_id);

alter table "public"."contract_comments_attachments" add constraint "contract_comments_attachments_pkey" PRIMARY KEY using index "contract_comments_attachments_pkey";

alter table "public"."contract_comments_attachments" add constraint "contract_comments_attachments_comment_id_fkey" FOREIGN KEY (comment_id) REFERENCES contract_comments(id) ON DELETE CASCADE not valid;

alter table "public"."contract_comments_attachments" validate constraint "contract_comments_attachments_comment_id_fkey";

alter table "public"."contract_comments_attachments" add constraint "contract_comments_attachments_organization_id_fkey" FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE not valid;

alter table "public"."contract_comments_attachments" validate constraint "contract_comments_attachments_organization_id_fkey";

alter table "public"."contract_comments_attachments" add constraint "contract_comments_attachments_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) not valid;

alter table "public"."contract_comments_attachments" validate constraint "contract_comments_attachments_user_id_fkey";

grant delete on table "public"."contract_comments_attachments" to "authenticated";

grant insert on table "public"."contract_comments_attachments" to "authenticated";

grant references on table "public"."contract_comments_attachments" to "authenticated";

grant select on table "public"."contract_comments_attachments" to "authenticated";

grant trigger on table "public"."contract_comments_attachments" to "authenticated";

grant truncate on table "public"."contract_comments_attachments" to "authenticated";

grant update on table "public"."contract_comments_attachments" to "authenticated";

grant delete on table "public"."contract_comments_attachments" to "service_role";

grant insert on table "public"."contract_comments_attachments" to "service_role";

grant references on table "public"."contract_comments_attachments" to "service_role";

grant select on table "public"."contract_comments_attachments" to "service_role";

grant trigger on table "public"."contract_comments_attachments" to "service_role";

grant truncate on table "public"."contract_comments_attachments" to "service_role";

grant update on table "public"."contract_comments_attachments" to "service_role";

create policy "Users can insert their own attachments"
on "public"."contract_comments_attachments"
as permissive
for insert
to public
with check ((auth.uid() = user_id));
