alter table "public"."inv_transaction" drop constraint "inv_transaction_type_ck";

alter table "public"."inv_transaction" add constraint "inv_transaction_type_ck" CHECK ((transaction_type = ANY (ARRAY['purchase'::text, 'sale'::text, 'conversion'::text, 'exercise'::text, 'distribution'::text, 'transfer_in'::text, 'transfer_out'::text, 'write_off'::text, 'exit_consideration'::text, 'reclassification'::text, 'secondary_sale'::text, 'secondary_purchase'::text, 'issuance'::text, 'affiliate_transfer_to'::text, 'affiliate_transfer_from'::text]))) not valid;

alter table "public"."inv_transaction" validate constraint "inv_transaction_type_ck";