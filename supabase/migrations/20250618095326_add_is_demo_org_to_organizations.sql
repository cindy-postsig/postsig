ALTER TABLE "public"."organizations" 
ADD COLUMN "is_demo_org" boolean DEFAULT false;

ALTER TABLE public.vendors
ADD COLUMN is_demo_vendor BOOLEAN DEFAULT FALSE;