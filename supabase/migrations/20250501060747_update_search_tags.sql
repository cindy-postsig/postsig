CREATE OR REPLACE FUNCTION public.contract_search(contracts)
 RETURNS text
 LANGUAGE plpgsql
AS $function$DECLARE
  search_document text;
BEGIN
  SELECT
    coalesce($1.summary, '') || ' ' ||
    coalesce((
      SELECT string_agg(v.name, ' ')
      FROM vendors v
      WHERE v.id = $1.vendor_id
    ), '') || ' ' ||
    coalesce((
      SELECT string_agg(vp.name, ' ')
      FROM vendor_products_details vpd
      JOIN vendor_products vp ON vpd.product_id = vp.id
      WHERE vpd.contract_id = $1.id
    ), '') || ' ' ||
    coalesce((
      SELECT string_agg(ac.name, ' ')
      FROM contract_asset_classes cac
      JOIN asset_classes ac ON ac.id = cac.asset_class_id
      WHERE cac.contract_id = $1.id
    ), '') || ' ' ||
    coalesce((
      SELECT string_agg(ut.name, ' ')
      FROM contract_tags ct
      JOIN user_tags ut ON ut.id = ct.tag_id
      WHERE ct.contract_id = $1.id
    ), '') || ' ' ||
    coalesce((
      SELECT ct.name
      FROM contract_types ct
      WHERE ct.id = $1.type_id
    ), '')
  INTO search_document;
  RETURN search_document;
END;$function$
;
