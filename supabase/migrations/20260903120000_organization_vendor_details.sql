-- Per-organization vendor details that customers maintain by hand: who to
-- call, and what to remember about the relationship.
--
-- Vendors are global rows shared by every organization, so these hang off the
-- organization↔vendor row rather than the vendor. They are first-class columns
-- rather than keys in `settings`: `settings` holds classification flags
-- (ict_provider) and /api/vendors/update replaces that object wholesale on an
-- ICT toggle, so free text stored inside it would be clobbered. Later
-- organization-specific vendor fields (a risk rating, for one) take the same
-- shape: one column each.

alter table public.organization_vendor_settings
    add column primary_contact_name text,
    add column primary_contact_email text,
    add column primary_contact_phone text,
    add column notes text;

comment on column public.organization_vendor_settings.primary_contact_name is 'The organization''s primary contact at this vendor, as typed by the organization. Null when blank.';
comment on column public.organization_vendor_settings.primary_contact_email is 'Email of the primary contact; validated as an address on write. Null when blank.';
comment on column public.organization_vendor_settings.primary_contact_phone is 'Phone of the primary contact, free text. Null when blank.';
comment on column public.organization_vendor_settings.notes is 'Free-text notes the organization keeps about this vendor. Null when blank.';
