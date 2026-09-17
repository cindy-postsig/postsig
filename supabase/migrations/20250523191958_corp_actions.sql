CREATE UNIQUE INDEX unique_primary_secondary_vendors ON public.corporate_actions USING btree (primary_vendor_id, secondary_vendor_id);

CREATE UNIQUE INDEX unique_primary_secondary_vendors_index ON public.corporate_actions USING btree (LEAST(primary_vendor_id, secondary_vendor_id), GREATEST(primary_vendor_id, secondary_vendor_id));

alter table "public"."corporate_actions" add constraint "unique_primary_secondary_vendors" UNIQUE using index "unique_primary_secondary_vendors";


