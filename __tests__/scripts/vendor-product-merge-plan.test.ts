import { describe, expect, it } from '@jest/globals';
import {
  buildVendorFamilies,
  planProductMerges,
  type CorpActionRow,
  type CurrentVendorRow,
  type ProductRow,
} from '@/scripts/vendor-product-merge-plan';

const lineage = (
  originalId: number,
  canonicalId: number,
): CurrentVendorRow => ({
  original_vendor_id: originalId,
  current_vendor_id: canonicalId,
});

const corpPair = (
  primaryId: number | null,
  secondaryId: number | null,
): CorpActionRow => ({
  primary_vendor_id: primaryId,
  secondary_vendor_id: secondaryId,
});

const product = (
  id: number,
  vendorId: number,
  name: string,
  createdAt = '2025-01-01T00:00:00Z',
): ProductRow => ({
  id,
  name,
  vendor_id: vendorId,
  created_at: createdAt,
});

describe('buildVendorFamilies', () => {
  it('groups merge-lineage vendors into one family', () => {
    const { familyOf, families } = buildVendorFamilies(
      [lineage(1, 2), lineage(2, 2)],
      [],
    );

    expect(familyOf.get(1)).toBe(familyOf.get(2));
    expect([...families.values()]).toEqual([[1, 2]]);
  });

  it('groups corp-action pairs into one family', () => {
    const { families } = buildVendorFamilies([], [corpPair(1, 5)]);

    expect([...families.values()]).toEqual([[1, 5]]);
  });

  it('joins a corp pair referencing a historical id to the merge lineage', () => {
    // 1 merged into 2; a corp action pairs historical id 1 with 5.
    const { families } = buildVendorFamilies(
      [lineage(1, 2), lineage(2, 2)],
      [corpPair(1, 5)],
    );

    expect([...families.values()]).toEqual([[1, 2, 5]]);
  });

  it('excludes single-member components and self rows', () => {
    const { familyOf, families } = buildVendorFamilies(
      [lineage(7, 7), lineage(1, 2), lineage(2, 2)],
      [corpPair(9, null)],
    );

    expect(familyOf.has(7)).toBe(false);
    expect(familyOf.has(9)).toBe(false);
    expect(families.size).toBe(1);
  });
});

describe('planProductMerges', () => {
  const families = buildVendorFamilies(
    [lineage(1, 2), lineage(2, 2)],
    [corpPair(2, 5)],
  );

  it('plans a merge for a same-name product forked across family vendors', () => {
    const plan = planProductMerges(
      [
        product(10, 2, 'Sales Cloud', '2024-01-01T00:00:00Z'),
        product(20, 5, 'Sales Cloud', '2025-06-01T00:00:00Z'),
      ],
      families,
    );

    expect(plan).toHaveLength(1);
    expect(plan[0].canonical.id).toBe(10);
    expect(plan[0].duplicates.map((d) => d.id)).toEqual([20]);
  });

  it('matches names by fold key, not exact text', () => {
    // Case-, accent- and punctuation-insensitive: both fold to "sales cloud".
    const plan = planProductMerges(
      [
        product(10, 2, 'Salés Cloud', '2024-01-01T00:00:00Z'),
        product(20, 5, 'SALES  CLOUD!', '2025-06-01T00:00:00Z'),
      ],
      families,
    );

    expect(plan).toHaveLength(1);
  });

  it('keeps the oldest row as canonical, tie-breaking on id', () => {
    const plan = planProductMerges(
      [
        product(30, 5, 'Sales Cloud', '2024-01-01T00:00:00Z'),
        product(10, 2, 'Sales Cloud', '2024-01-01T00:00:00Z'),
        product(20, 1, 'Sales Cloud', '2025-06-01T00:00:00Z'),
      ],
      families,
    );

    expect(plan[0].canonical.id).toBe(10);
    expect(plan[0].duplicates.map((d) => d.id)).toEqual([20, 30]);
  });

  it('leaves same-vendor-only duplicates alone', () => {
    // Both rows under vendor 2 — a pre-existing dupe, not a family fork.
    const plan = planProductMerges(
      [product(10, 2, 'Sales Cloud'), product(20, 2, 'Sales Cloud')],
      families,
    );

    expect(plan).toEqual([]);
  });

  it('ignores products of vendors outside any family', () => {
    const plan = planProductMerges(
      [product(10, 2, 'Sales Cloud'), product(20, 99, 'Sales Cloud')],
      families,
    );

    expect(plan).toEqual([]);
  });

  it('does not group different product names', () => {
    const plan = planProductMerges(
      [product(10, 2, 'Sales Cloud'), product(20, 5, 'Marketing Cloud')],
      families,
    );

    expect(plan).toEqual([]);
  });

  it('skips products whose name folds to nothing', () => {
    const plan = planProductMerges(
      [product(10, 2, '***'), product(20, 5, '***')],
      families,
    );

    expect(plan).toEqual([]);
  });
});
