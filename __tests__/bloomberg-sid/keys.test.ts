import {
  isSidContractId,
  isSidRollupKey,
  sidExchangeHref,
  sidRenewingRollupKey,
  sidRollupHref,
  sidRollupKey,
  sidRollupRenewingDays,
  sidRollupVendorId,
  sidSubscriptionsHref,
} from '@/lib/v2/bloomberg-sid/keys';

describe('sid rollup keys', () => {
  it('round-trips a vendor id', () => {
    expect(sidRollupKey(469)).toBe('bloomberg:469');
    expect(sidRollupVendorId('bloomberg:469')).toBe(469);
    expect(isSidRollupKey('bloomberg:469')).toBe(true);
    expect(sidRollupRenewingDays('bloomberg:469')).toBeNull();
  });

  it('round-trips a renewals-report key with its window', () => {
    expect(sidRenewingRollupKey(469, 90)).toBe('bloomberg:469:renewing:90');
    expect(sidRollupVendorId('bloomberg:469:renewing:90')).toBe(469);
    expect(sidRollupRenewingDays('bloomberg:469:renewing:90')).toBe(90);
    expect(isSidRollupKey('bloomberg:469:renewing:90')).toBe(true);
  });

  it('rejects contract ids, seat ids and malformed keys', () => {
    expect(sidRollupVendorId('469')).toBeNull();
    expect(sidRollupVendorId('-30041555')).toBeNull();
    expect(sidRollupVendorId('bloomberg:')).toBeNull();
    expect(sidRollupVendorId('bloomberg:abc')).toBeNull();
    expect(sidRollupVendorId('bloomberg:0')).toBeNull();
    expect(sidRollupVendorId('bloomberg:469:renewing')).toBeNull();
    expect(sidRollupVendorId('bloomberg:469:renewing:0')).toBeNull();
    expect(sidRollupVendorId('bloomberg:469:renewing:x')).toBeNull();
    expect(sidRollupVendorId('bloomberg:469:expiring:90')).toBeNull();
    expect(sidRollupVendorId('bloomberg:469:renewing:90:extra')).toBeNull();
    expect(isSidRollupKey('vendor-469')).toBe(false);
  });
});

describe('sid rollup links', () => {
  it('opens a plain rollup on the vendor inventory view', () => {
    expect(sidRollupHref('bloomberg:469')).toBe('/vendors/469/inventory');
  });

  it('opens the renewals row on the seats renewing in its window', () => {
    expect(sidRollupHref('bloomberg:469:renewing:90')).toBe(
      '/vendors/469/inventory?tab=subscriptions&renewing=90',
    );
  });

  it('is null for a contract id', () => {
    expect(sidRollupHref('469')).toBeNull();
  });

  it('narrows the subscriptions tab to a product, encoded', () => {
    expect(
      sidSubscriptionsHref(469, { product: 'Bloomberg Anywhere & More' }),
    ).toBe(
      '/vendors/469/inventory?tab=subscriptions&product=Bloomberg%20Anywhere%20%26%20More',
    );
    expect(sidSubscriptionsHref(469)).toBe(
      '/vendors/469/inventory?tab=subscriptions',
    );
  });

  it('opens the exchange entitlements tab', () => {
    expect(sidExchangeHref(469)).toBe('/vendors/469/inventory?tab=exchange');
  });
});

describe('isSidContractId', () => {
  it('tells a Bloomberg account from a contract by sign', () => {
    expect(isSidContractId(-28929)).toBe(true);
    expect(isSidContractId(3000)).toBe(false);
  });
});
