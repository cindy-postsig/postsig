/**
 * hasFeeOverrides across both version-row shapes.
 *
 * The contract-set fetches stopped shipping `changed_data` — they select a key
 * column and let PostgREST filter the embed down to rows whose `changed_data`
 * has a `fees` key, so on that path a row's presence is the whole answer.
 * Callers that still load the column (fixtures, the contract-edit reads) keep
 * the original `fees` inspection. Both have to stay correct, and the narrow
 * shape must not turn a non-fee edit loaded elsewhere into a false override.
 */
import { hasFeeOverrides } from '@/lib/v2/products/transforms';

describe('hasFeeOverrides — narrow (query-filtered) rows', () => {
  it('treats a version row with no changed_data as a fee override', () => {
    expect(
      hasFeeOverrides({
        vendor_products_details: [{ vendor_products_details_versions: [{}] }],
      }),
    ).toBe(true);
  });

  it('is false when the filtered embed came back empty', () => {
    expect(
      hasFeeOverrides({
        vendor_products_details: [{ vendor_products_details_versions: [] }],
      }),
    ).toBe(false);
  });

  it('is false when no product carries a versions array', () => {
    expect(hasFeeOverrides({ vendor_products_details: [{}] })).toBe(false);
  });

  it('is false when the contract has no products at all', () => {
    expect(hasFeeOverrides({})).toBe(false);
  });
});

describe('hasFeeOverrides — full changed_data rows', () => {
  it('is true when changed_data carries a fees key', () => {
    expect(
      hasFeeOverrides({
        vendor_products_details: [
          {
            vendor_products_details_versions: [
              { changed_data: { fees: 9999 } },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it('is true when the recorded fee edit was null', () => {
    expect(
      hasFeeOverrides({
        vendor_products_details: [
          {
            vendor_products_details_versions: [
              { changed_data: { fees: null } },
            ],
          },
        ],
      }),
    ).toBe(true);
  });

  it('is false when changed_data records a non-fee edit', () => {
    expect(
      hasFeeOverrides({
        vendor_products_details: [
          {
            vendor_products_details_versions: [
              { changed_data: { n_users: 12 } },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it('is false when changed_data is null', () => {
    expect(
      hasFeeOverrides({
        vendor_products_details: [
          { vendor_products_details_versions: [{ changed_data: null }] },
        ],
      }),
    ).toBe(false);
  });

  it('finds the override on a later product', () => {
    expect(
      hasFeeOverrides({
        vendor_products_details: [
          { vendor_products_details_versions: [{ changed_data: null }] },
          { vendor_products_details_versions: [{ changed_data: { fees: 1 } }] },
        ],
      }),
    ).toBe(true);
  });
});
