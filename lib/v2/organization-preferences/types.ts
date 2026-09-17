import { z } from 'zod';

export const VendorWhitelistEntrySchema = z.object({
  email: z
    .string()
    .email()
    .or(z.string().regex(/^\*@[\w\-.]+\.\w+$/)),
  vendorName: z.string().optional(),
  addedAt: z.string().datetime(),
});

export type VendorWhitelistEntry = z.infer<typeof VendorWhitelistEntrySchema>;

export const VendorWhitelistSchema = z.array(VendorWhitelistEntrySchema);

export type VendorWhitelist = z.infer<typeof VendorWhitelistSchema>;

export const CSVVendorEntrySchema = z.object({
  email: z.string().min(1, 'Email is required'),
  vendor_name: z.string().optional(),
});

export type CSVVendorEntry = z.infer<typeof CSVVendorEntrySchema>;

export interface OrganizationPreference<T = unknown> {
  id: string;
  organizationId: string;
  preferenceKey: string;
  preferenceValue: T;
  createdAt: string;
  updatedAt: string;
}

export interface VendorWhitelistPreference extends OrganizationPreference<VendorWhitelist> {
  preferenceKey: 'vendor_whitelist';
}

export interface CSVValidationResult {
  valid: VendorWhitelistEntry[];
  invalid: Array<{
    row: number;
    data: unknown;
    errors: string[];
  }>;
  duplicates: string[];
}
