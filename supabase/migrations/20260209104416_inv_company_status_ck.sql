alter table "public"."inv_companies" drop constraint "inv_companies_status_check";

alter table "public"."inv_transaction" drop constraint "inv_transaction_type_ck";

alter table "public"."inv_companies" add constraint "inv_companies_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'exited_ipo'::text, 'exited_acquisition'::text, 'exited_merger'::text, 'exited_liquidation'::text, 'written_off'::text, 'inactive'::text]))) not valid;

alter table "public"."inv_companies" validate constraint "inv_companies_status_check";

alter table "public"."inv_transaction" add constraint "inv_transaction_type_ck" CHECK ((transaction_type = ANY (ARRAY['purchase'::text, 'sale'::text, 'conversion'::text, 'exercise'::text, 'distribution'::text, 'transfer_in'::text, 'transfer_out'::text, 'write_off'::text, 'exit_consideration'::text, 'reclassification'::text, 'secondary_sale'::text, 'secondary_purchase'::text, 'issuance'::text]))) not valid;

alter table "public"."inv_transaction" validate constraint "inv_transaction_type_ck";