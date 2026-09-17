-- Enforce NOT NULL on name and address, and add unique constraint on (name, address, organization_id)

ALTER TABLE public.client_entities
    ALTER COLUMN name SET NOT NULL,
    ALTER COLUMN address SET NOT NULL;

ALTER TABLE public.client_entities
    ADD CONSTRAINT client_entities_name_address_org_id_unique
    UNIQUE (name, address, organization_id);
