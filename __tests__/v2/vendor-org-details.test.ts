import {
  EMPTY_VENDOR_ORG_DETAILS,
  toVendorOrgDetails,
  toVendorOrgDetailsRow,
  vendorOrgDetailsInputSchema,
} from '@/lib/v2/vendors/details';

describe('vendorOrgDetailsInputSchema', () => {
  it('trims every field and stores blanks as null', () => {
    const parsed = vendorOrgDetailsInputSchema.parse({
      primaryContactName: '  Jane Doe ',
      primaryContactEmail: '   ',
      primaryContactPhone: '',
      notes: ' Renewal talks start in Q3. ',
    });
    expect(parsed).toEqual({
      primaryContactName: 'Jane Doe',
      primaryContactEmail: null,
      primaryContactPhone: null,
      notes: 'Renewal talks start in Q3.',
    });
  });

  it('accepts a valid email and rejects a malformed one', () => {
    expect(
      vendorOrgDetailsInputSchema.parse({
        primaryContactName: '',
        primaryContactEmail: ' jane@vendor.example ',
        primaryContactPhone: '',
        notes: '',
      }).primaryContactEmail,
    ).toBe('jane@vendor.example');

    const result = vendorOrgDetailsInputSchema.safeParse({
      primaryContactName: '',
      primaryContactEmail: 'not-an-email',
      primaryContactPhone: '',
      notes: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        'Enter a valid email address',
      );
    }
  });

  it('rejects notes past the length limit', () => {
    const result = vendorOrgDetailsInputSchema.safeParse({
      primaryContactName: '',
      primaryContactEmail: '',
      primaryContactPhone: '',
      notes: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });
});

describe('toVendorOrgDetails', () => {
  it('maps a missing row to empty details', () => {
    expect(toVendorOrgDetails(null)).toEqual(EMPTY_VENDOR_ORG_DETAILS);
  });

  it('round-trips through the row shape', () => {
    const details = {
      primaryContactName: 'Jane Doe',
      primaryContactEmail: 'jane@vendor.example',
      primaryContactPhone: '+1 555 0100',
      notes: 'Prefers email.',
    };
    expect(toVendorOrgDetails(toVendorOrgDetailsRow(details))).toEqual(details);
  });
});
