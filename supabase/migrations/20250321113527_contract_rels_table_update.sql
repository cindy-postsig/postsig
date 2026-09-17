alter table "public"."contract_relationships" add constraint "contract_relationships_child_contract_id_fkey1" FOREIGN KEY (child_contract_id) REFERENCES contracts(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."contract_relationships" validate constraint "contract_relationships_child_contract_id_fkey1";

alter table "public"."contract_relationships" add constraint "contract_relationships_parent_contract_id_fkey1" FOREIGN KEY (parent_contract_id) REFERENCES contracts(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."contract_relationships" validate constraint "contract_relationships_parent_contract_id_fkey1";

alter table "public"."contract_relationships" add constraint "contract_relationships_vendor_id_fkey" FOREIGN KEY (vendor_id) REFERENCES vendors(id) ON UPDATE CASCADE not valid;

alter table "public"."contract_relationships" validate constraint "contract_relationships_vendor_id_fkey";


