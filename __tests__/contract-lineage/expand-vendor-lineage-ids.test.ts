import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

interface CurrentVendorRow {
  original_vendor_id: number | null;
  current_vendor_id: number | null;
}

interface CorporateActionRow {
  primary_vendor_id: number | null;
  secondary_vendor_id: number | null;
}

let mockViewRows: CurrentVendorRow[] = [];
let mockCorpRows: CorporateActionRow[] = [];
let mockError: { message: string } | null = null;
const viewFilters: { column: string; values: number[] }[] = [];

function viewResult(column: string, values: number[]) {
  viewFilters.push({ column, values });
  if (mockError) {
    return Promise.resolve({ data: null, error: mockError });
  }
  const data = mockViewRows.filter((row) =>
    values.includes(row[column as keyof CurrentVendorRow] as number),
  );
  return Promise.resolve({ data, error: null });
}

// The corp-action query arrives as
// `primary_vendor_id.in.(ids),secondary_vendor_id.in.(ids)` — mirror PostgREST
// by returning rows where either side is in the id list.
function corpResult(expression: string) {
  if (mockError) {
    return Promise.resolve({ data: null, error: mockError });
  }
  const ids = (expression.match(/\(([^)]*)\)/)?.[1] ?? '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  const touches = (row: CorporateActionRow) =>
    (row.primary_vendor_id != null && ids.includes(row.primary_vendor_id)) ||
    (row.secondary_vendor_id != null && ids.includes(row.secondary_vendor_id));
  return Promise.resolve({ data: mockCorpRows.filter(touches), error: null });
}

// `current_vendors` is filtered with `.eq` (input lineage) and `.in` (partner
// lineages); only the shape of the value differs, so one resolver serves both.
const currentVendorsHandler = {
  select: () => ({
    eq: (column: string, value: number) => viewResult(column, [value]),
    in: (column: string, values: number[]) => viewResult(column, values),
  }),
};

const corporateActionsHandler = {
  select: () => ({ or: corpResult }),
};

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: (table: string) =>
      table === 'corporate_actions'
        ? corporateActionsHandler
        : currentVendorsHandler,
  }),
}));

import { expandVendorLineageIds } from '@/data/superuser/vendors';

/** Mirrors the view: active vendors emit a self-row, merged ones map upward. */
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
): CorporateActionRow => ({
  primary_vendor_id: primaryId,
  secondary_vendor_id: secondaryId,
});

describe('expandVendorLineageIds', () => {
  beforeEach(() => {
    mockViewRows = [];
    mockCorpRows = [];
    mockError = null;
    viewFilters.length = 0;
  });

  describe('merge lineage', () => {
    it('returns the full lineage when given a merged (original) vendor id', async () => {
      // Vendor 1 merged into vendor 2; vendor 2 is active.
      mockViewRows = [lineage(1, 2), lineage(2, 2)];

      const result = await expandVendorLineageIds(1);

      expect(result).toEqual(expect.arrayContaining([1, 2]));
      expect(result).toHaveLength(2);
    });

    it('returns the full lineage when given the canonical vendor id', async () => {
      mockViewRows = [lineage(1, 2), lineage(2, 2)];

      const result = await expandVendorLineageIds(2);

      expect(result).toEqual(expect.arrayContaining([1, 2]));
      expect(result).toHaveLength(2);
    });

    it('falls back to the input id when the vendor has no view row', async () => {
      // Untouched by corporate actions and `status` NULL — absent from the view.
      mockViewRows = [lineage(7, 7)];

      await expect(expandVendorLineageIds(42)).resolves.toEqual([42]);
    });

    it('returns only itself for an active vendor with no merge history', async () => {
      mockViewRows = [lineage(7, 7)];

      await expect(expandVendorLineageIds(7)).resolves.toEqual([7]);
    });

    it('resolves a chained lineage A -> B -> C from any member', async () => {
      // The recursive view flattens A->B->C, so every original maps to C (3).
      mockViewRows = [lineage(1, 3), lineage(2, 3), lineage(3, 3)];

      for (const startId of [1, 2, 3]) {
        const result = await expandVendorLineageIds(startId);
        expect(result).toEqual(expect.arrayContaining([1, 2, 3]));
        expect(result).toHaveLength(3);
      }
    });

    it('deduplicates the input id against the fanned-out lineage', async () => {
      mockViewRows = [lineage(1, 2), lineage(2, 2)];

      const result = await expandVendorLineageIds(1);

      expect(new Set(result).size).toBe(result.length);
    });

    it('canonicalizes by original_vendor_id, then fans out by current_vendor_id', async () => {
      mockViewRows = [lineage(1, 2), lineage(2, 2)];

      await expandVendorLineageIds(1);

      // Swapping these two filters would still return the right columns but
      // the wrong rows, so a projection assertion alone cannot catch it.
      expect(viewFilters.map((f) => f.column)).toEqual([
        'original_vendor_id',
        'current_vendor_id',
      ]);
    });

    it('throws a DatabaseError when the view query fails', async () => {
      mockError = { message: 'connection reset' };

      await expect(expandVendorLineageIds(1)).rejects.toThrow(
        'Failed to expand vendor lineage',
      );
    });
  });

  describe('corporate-action hop', () => {
    it('includes a corp-action partner of the vendor', async () => {
      mockViewRows = [lineage(1, 1), lineage(5, 5)];
      mockCorpRows = [corpPair(1, 5)];

      const result = await expandVendorLineageIds(1);

      expect(result).toEqual(expect.arrayContaining([1, 5]));
      expect(result).toHaveLength(2);
    });

    it('matches corp rows in either direction', async () => {
      mockViewRows = [lineage(1, 1), lineage(5, 5)];
      mockCorpRows = [corpPair(5, 1)];

      const result = await expandVendorLineageIds(1);

      expect(result).toEqual(expect.arrayContaining([1, 5]));
      expect(result).toHaveLength(2);
    });

    it("includes the partner's own merge lineage", async () => {
      // Vendor 6 merged into partner 5; corp action pairs 1 with 5.
      mockViewRows = [lineage(1, 1), lineage(5, 5), lineage(6, 5)];
      mockCorpRows = [corpPair(1, 5)];

      const result = await expandVendorLineageIds(1);

      expect(result).toEqual(expect.arrayContaining([1, 5, 6]));
      expect(result).toHaveLength(3);
    });

    it('finds partners paired with a merged sibling, not just the input id', async () => {
      // Vendor 1 merged into 2; the corp action references historical id 1.
      mockViewRows = [lineage(1, 2), lineage(2, 2), lineage(5, 5)];
      mockCorpRows = [corpPair(1, 5)];

      const result = await expandVendorLineageIds(2);

      expect(result).toEqual(expect.arrayContaining([1, 2, 5]));
      expect(result).toHaveLength(3);
    });

    it('canonicalizes a partner referenced by a historical id', async () => {
      // Corp action pairs 1 with 6, but 6 has since merged into 5.
      mockViewRows = [lineage(1, 1), lineage(5, 5), lineage(6, 5)];
      mockCorpRows = [corpPair(1, 6)];

      const result = await expandVendorLineageIds(1);

      expect(result).toEqual(expect.arrayContaining([1, 5, 6]));
      expect(result).toHaveLength(3);
    });

    it('does not follow corp actions transitively', async () => {
      // 1 <-> 5 and 5 <-> 9: relatedness is pairwise, so 9 stays out.
      mockViewRows = [lineage(1, 1), lineage(5, 5), lineage(9, 9)];
      mockCorpRows = [corpPair(1, 5), corpPair(5, 9)];

      const result = await expandVendorLineageIds(1);

      expect(result).toEqual(expect.arrayContaining([1, 5]));
      expect(result).not.toContain(9);
    });

    it('ignores corp rows with a null secondary vendor', async () => {
      // name_change / spinoff rows carry no counterparty.
      mockViewRows = [lineage(1, 1)];
      mockCorpRows = [corpPair(1, null)];

      await expect(expandVendorLineageIds(1)).resolves.toEqual([1]);
    });

    it('skips the partner-lineage queries when there are no partners', async () => {
      mockViewRows = [lineage(1, 2), lineage(2, 2)];

      await expandVendorLineageIds(1);

      // Two input-lineage queries only — no batched partner fan-out.
      expect(viewFilters).toHaveLength(2);
    });
  });
});
