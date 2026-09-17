UPDATE public.document_types
SET description = 'Secondary share purchase agreements — seller/buyer details, price per share, ROFR waiver documentation, and post-closing transfer mechanics.<br>**Extraction notes: Selected client fund should match either the seller or the buyer of transaction economics.**'
WHERE module_id = 2
  AND code = 'secondary_purchase';
