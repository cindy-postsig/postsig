import { z } from 'zod';

export interface VendorOrgDetails {
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  notes: string | null;
}

export const EMPTY_VENDOR_ORG_DETAILS: VendorOrgDetails = {
  primaryContactName: null,
  primaryContactEmail: null,
  primaryContactPhone: null,
  notes: null,
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || null);

const optionalEmail = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || z.email().safeParse(value).success,
    'Enter a valid email address',
  )
  .transform((value) => value || null);

export const vendorOrgDetailsInputSchema = z.object({
  primaryContactName: optionalText(200),
  primaryContactEmail: optionalEmail,
  primaryContactPhone: optionalText(50),
  notes: optionalText(5000),
});

export type VendorOrgDetailsInput = z.input<typeof vendorOrgDetailsInputSchema>;

export interface VendorOrgDetailsRow {
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  primary_contact_phone: string | null;
  notes: string | null;
}

export function toVendorOrgDetails(
  row: VendorOrgDetailsRow | null,
): VendorOrgDetails {
  if (!row) return EMPTY_VENDOR_ORG_DETAILS;
  return {
    primaryContactName: row.primary_contact_name,
    primaryContactEmail: row.primary_contact_email,
    primaryContactPhone: row.primary_contact_phone,
    notes: row.notes,
  };
}

export function toVendorOrgDetailsRow(
  details: VendorOrgDetails,
): VendorOrgDetailsRow {
  return {
    primary_contact_name: details.primaryContactName,
    primary_contact_email: details.primaryContactEmail,
    primary_contact_phone: details.primaryContactPhone,
    notes: details.notes,
  };
}
