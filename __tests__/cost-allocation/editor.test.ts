import { formatCurrency } from '@/app/lib/utils';
import {
  activeUsersPreview,
  allocationProvenance,
  amountToPercent,
  applyEqualSplit,
  balanceMessage,
  canSaveScopes,
  clampPercent,
  displayAmounts,
  editorScopeFromResolved,
  equalSplitPercents,
  needsScopeChoice,
  provenanceLabel,
  scopeTotals,
  seatHolderTargets,
  seatsForScope,
  toSaveScopes,
  unlinkedSeatsNote,
  type EditorScope,
  scopeValueFor,
  applicableScopes,
} from '@/lib/v2/cost-allocation/editor';
import { normalizeScopes } from '@/lib/v2/cost-allocation/service';
import {
  PERCENT_SUM_TOLERANCE,
  PERCENT_UNIT,
} from '@/lib/v2/cost-allocation/percent';
import type { PickerCategory } from '@/lib/v2/cost-allocation/picker';
import type {
  AllocationTargetRef,
  ResolvedScope,
} from '@/lib/v2/cost-allocation/types';

jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const unit = (id: number, name = `Unit ${id}`): AllocationTargetRef => ({
  kind: 'org_unit',
  id,
  name,
});
const person = (id: number, name = `Person ${id}`): AllocationTargetRef => ({
  kind: 'employee',
  id,
  name,
  orgUnitId: null,
});

describe('needsScopeChoice', () => {
  it('offers the chooser only for two or more products', () => {
    expect(needsScopeChoice(0)).toBe(false);
    expect(needsScopeChoice(1)).toBe(false);
    expect(needsScopeChoice(2)).toBe(true);
    expect(needsScopeChoice(7)).toBe(true);
  });
});

describe('equalSplitPercents', () => {
  it('produces shares the save service accepts for any count', () => {
    for (const count of [1, 2, 3, 6, 7, 11, 13, 97, 250]) {
      const percents = equalSplitPercents(count);
      expect(percents).toHaveLength(count);
      const sumUnits = percents.reduce(
        (a, b) => a + Math.round(b * PERCENT_UNIT),
        0,
      );
      expect(sumUnits).toBeLessThanOrEqual(100 * PERCENT_UNIT);
      expect(100 * PERCENT_UNIT - sumUnits).toBeLessThanOrEqual(
        PERCENT_SUM_TOLERANCE * PERCENT_UNIT,
      );
      expect(() =>
        normalizeScopes([
          {
            productId: null,
            mode: 'manual',
            lines: percents.map((percent, i) => ({
              orgUnitId: i + 1,
              percent,
            })),
          },
        ]),
      ).not.toThrow();
    }
  });

  it('is truncated-equal: every share identical, the backfill convention', () => {
    expect(equalSplitPercents(3)).toEqual([33.3333, 33.3333, 33.3333]);
    expect(equalSplitPercents(7)).toEqual(Array(7).fill(14.2857));
    expect(equalSplitPercents(0)).toEqual([]);
  });

  it('applyEqualSplit rewrites every line percent', () => {
    const lines = applyEqualSplit([
      { target: unit(1), percent: 90 },
      { target: unit(2), percent: 10 },
    ]);
    expect(lines.map((l) => l.percent)).toEqual([50, 50]);
  });
});

describe('amount ↔ percent', () => {
  it('converts an amount to percent against the scope value, clamped', () => {
    expect(amountToPercent(250, 1000)).toBe(25);
    expect(amountToPercent(1500, 1000)).toBe(100);
    expect(amountToPercent(-5, 1000)).toBe(0);
    expect(amountToPercent(333.333, 1000)).toBe(33.3333);
  });

  it('refuses amounts on a zero-value scope', () => {
    expect(amountToPercent(100, 0)).toBe(0);
  });

  it('clamps and rounds typed percents', () => {
    expect(clampPercent(150)).toBe(100);
    expect(clampPercent(-2)).toBe(0);
    expect(clampPercent(12.345678)).toBe(12.3457);
    expect(clampPercent(Number.NaN)).toBe(0);
  });
});

describe('displayAmounts', () => {
  const sum = (amounts: (number | null)[]) =>
    amounts.reduce((total: number, amount) => total + (amount ?? 0), 0);

  it('ties an equal split back to the scope total (QA: €1,200 over 7 users)', () => {
    const amounts = displayAmounts(equalSplitPercents(7), 1200);

    expect(sum(amounts)).toBe(1200);
    expect(amounts).toEqual([172, 172, 172, 171, 171, 171, 171]);
  });

  // Through formatCurrency itself rather than a restatement of its rounding:
  // the contract is that the column and the footer PRINT the same total, and
  // the tables format both with the same whole-unit formatter.
  const printed = (value: number) => formatCurrency(value, 'EUR');
  const footer = (percents: number[], scopeValue: number) =>
    scopeTotals(
      percents.map((percent) => ({ percent })),
      scopeValue,
    ).amount;

  it('prints a column total equal to the printed footer, whatever the split', () => {
    const splits = [
      ...[1, 2, 3, 6, 7, 11, 13, 97, 250].map(equalSplitPercents),
      [33.3333, 33.3333, 33.3334],
      [33.3333],
      [12.5, 87.5],
      [0.0001, 99.9999],
    ];
    for (const percents of splits) {
      for (const scopeValue of [1200, 999_999, 4321.87, 1000, 7, 0.5]) {
        expect(printed(sum(displayAmounts(percents, scopeValue)))).toBe(
          printed(footer(percents, scopeValue)),
        );
      }
    }
  });

  it('distributes only what the lines allocate, not the whole scope value', () => {
    expect(displayAmounts([25, 25], 1000)).toEqual([250, 250]);
    expect(displayAmounts([33.3333], 1000)).toEqual([333]);
  });

  it('leaves whole shares alone and has no amounts for a valueless scope', () => {
    expect(displayAmounts([60, 40], 1000)).toEqual([600, 400]);
    expect(displayAmounts([60, 40], null)).toEqual([null, null]);
    expect(displayAmounts([], 1000)).toEqual([]);
  });
});

describe('scopeTotals and balanceMessage', () => {
  it('reports totals, balance within the service tolerance, and emptiness', () => {
    expect(scopeTotals([], 500)).toEqual({
      percent: 0,
      amount: 0,
      balanced: false,
      isEmpty: true,
    });
    expect(scopeTotals([{ percent: 50 }, { percent: 49.995 }], 1000)).toEqual({
      percent: 99.995,
      amount: 999.95,
      balanced: true,
      isEmpty: false,
    });
    expect(scopeTotals([{ percent: 60 }, { percent: 30 }], 1000).balanced).toBe(
      false,
    );
  });

  it('phrases under and over messages and stays silent when balanced', () => {
    expect(balanceMessage(90)).toBe(
      'Allocation is 10% under 100%. Adjust the percentages to reach 100%.',
    );
    expect(balanceMessage(112.5)).toBe(
      'Allocation is 12.5% over 100%. Adjust the percentages to reach 100%.',
    );
    expect(balanceMessage(100)).toBeNull();
    expect(balanceMessage(99.995)).toBeNull();
  });
});

describe('canSaveScopes', () => {
  const manual = (percents: number[]): EditorScope => ({
    productId: null,
    mode: 'manual',
    method: 'manual',
    lines: percents.map((percent, i) => ({ target: unit(i + 1), percent })),
  });

  it('requires every populated scope to total 100', () => {
    expect(canSaveScopes([manual([60, 40])], false)).toBe(true);
    expect(canSaveScopes([manual([60, 30])], false)).toBe(false);
    expect(
      canSaveScopes(
        [
          { ...manual([100]), productId: 1 },
          { ...manual([50]), productId: 2 },
        ],
        false,
      ),
    ).toBe(false);
  });

  it('ignores empty scopes and treats active_users as populated', () => {
    expect(
      canSaveScopes(
        [
          { ...manual([100]), productId: 1 },
          { ...manual([]), productId: 2 },
        ],
        false,
      ),
    ).toBe(true);
    expect(
      canSaveScopes(
        [{ productId: null, mode: 'active_users', method: 'equal', lines: [] }],
        false,
      ),
    ).toBe(true);
  });

  it('allows an empty save only when it clears an existing own allocation', () => {
    expect(canSaveScopes([manual([])], false)).toBe(false);
    expect(canSaveScopes([manual([])], true)).toBe(true);
  });
});

describe('editorScopeFromResolved and toSaveScopes', () => {
  it('starts empty in equal mode when nothing resolved', () => {
    expect(editorScopeFromResolved(7, undefined)).toEqual({
      productId: 7,
      mode: 'manual',
      method: 'equal',
      lines: [],
    });
  });

  it('detects an equal split and preserves uneven lines as manual', () => {
    const resolved = (percents: number[]): ResolvedScope => ({
      productId: null,
      mode: 'manual',
      sourceContractId: 1,
      unlinkedUserCount: 0,
      lines: percents.map((percent, i) => ({ target: unit(i + 1), percent })),
    });
    expect(editorScopeFromResolved(null, resolved([50, 50])).method).toBe(
      'equal',
    );
    expect(editorScopeFromResolved(null, resolved([70, 30])).method).toBe(
      'manual',
    );
  });

  it('serializes manual lines by target kind and drops lines for active_users', () => {
    expect(
      toSaveScopes([
        {
          productId: null,
          mode: 'manual',
          method: 'manual',
          lines: [
            { target: unit(3), percent: 60 },
            { target: person(9), percent: 40 },
          ],
        },
      ]),
    ).toEqual([
      {
        productId: null,
        mode: 'manual',
        lines: [
          { orgUnitId: 3, orgEmployeeId: null, percent: 60 },
          { orgUnitId: null, orgEmployeeId: 9, percent: 40 },
        ],
      },
    ]);
    expect(
      toSaveScopes([
        {
          productId: 4,
          mode: 'active_users',
          method: 'equal',
          lines: [{ target: person(1), percent: 100 }],
        },
        { productId: 5, mode: 'manual', method: 'equal', lines: [] },
      ]),
    ).toEqual([{ productId: 4, mode: 'active_users' }]);
  });
});

describe('active_users view-model', () => {
  const catalog: PickerCategory[] = [
    {
      key: 'user',
      label: 'Users',
      items: [
        { target: person(1, 'Ada Lovelace') },
        { target: person(2, 'Bob Builder') },
      ],
    },
  ];
  // Employee 3 holds a seat but is off the catalog: departed, on leave, or
  // deleted. Nothing releases a seat when someone leaves, so the seat alone
  // must not make them an active user.
  const seats = [
    { productId: null, employeeId: 1 },
    { productId: 10, employeeId: 2 },
    { productId: 10, employeeId: 2 },
    { productId: 10, employeeId: null },
    { productId: 20, employeeId: 3 },
  ];

  it('narrows seats to the scope the way the resolver does', () => {
    expect(seatsForScope(seats, null)).toHaveLength(5);
    expect(seatsForScope(seats, 10).map((s) => s.employeeId)).toEqual([
      2,
      2,
      null,
    ]);
  });

  it('dedupes holders, counts unlinked seats, and drops an off-catalog holder', () => {
    const { holders, unlinkedCount } = seatHolderTargets(seats, catalog);
    expect(holders.map((h) => [h.id, h.name])).toEqual([
      [1, 'Ada Lovelace'],
      [2, 'Bob Builder'],
    ]);
    expect(unlinkedCount).toBe(1);
  });

  it('leaves an inactive holder out of the live split entirely', () => {
    const preview = activeUsersPreview(seatsForScope(seats, 20), catalog);
    expect(preview.lines).toEqual([]);
    expect(preview.unlinkedCount).toBe(0);
  });

  it('previews the live equal split with the unlinked count surfaced', () => {
    const preview = activeUsersPreview(seatsForScope(seats, 10), catalog);
    expect(preview.lines).toEqual([
      { target: person(2, 'Bob Builder'), percent: 100 },
    ]);
    expect(preview.unlinkedCount).toBe(1);
    expect(unlinkedSeatsNote(1)).toBe(
      '1 unlinked seat is not included — link them to employees to allocate their share.',
    );
    expect(unlinkedSeatsNote(3)).toMatch(/^3 unlinked seats are/);
    expect(unlinkedSeatsNote(0)).toBeNull();
  });
});

describe('provenance', () => {
  const scope = (sourceContractId: number): ResolvedScope => ({
    productId: null,
    mode: 'manual',
    sourceContractId,
    lines: [],
    unlinkedUserCount: 0,
  });

  it('classifies own, inherited, and unassigned resolutions', () => {
    expect(allocationProvenance({ contractId: 1, scopes: [] })).toEqual({
      kind: 'none',
    });
    expect(allocationProvenance({ contractId: 1, scopes: [scope(1)] })).toEqual(
      { kind: 'own' },
    );
    expect(allocationProvenance({ contractId: 9, scopes: [scope(1)] })).toEqual(
      { kind: 'inherited', sourceContractId: 1 },
    );
  });

  it('labels provenance for invoices and contracts', () => {
    expect(provenanceLabel({ kind: 'none' }, { isInvoice: true })).toBe(
      'No allocation',
    );
    expect(provenanceLabel({ kind: 'own' }, { isInvoice: true })).toBe(
      'Set on this invoice',
    );
    expect(provenanceLabel({ kind: 'own' }, { isInvoice: false })).toBe(
      'Set on this contract',
    );
    expect(
      provenanceLabel(
        { kind: 'inherited', sourceContractId: 42 },
        { isInvoice: true, sourceContractName: 'Service Order · ID 42' },
      ),
    ).toBe('Inherited from Service Order · ID 42');
    expect(
      provenanceLabel(
        { kind: 'inherited', sourceContractId: 42 },
        { isInvoice: true },
      ),
    ).toBe('Inherited from contract #42');
  });
});

describe('scopeValueFor', () => {
  it("reads a stamped record's unstamped product as zero, the engine's own answer", () => {
    const values = { contract: 0, products: {} };
    expect(scopeValueFor(values, null)).toBe(0);
    expect(scopeValueFor(values, 7)).toBe(0);
    expect(scopeValueFor({ contract: 900, products: { 7: 225 } }, 7)).toBe(225);
    expect(scopeValueFor({ contract: 900, products: { 7: 225 } }, 8)).toBe(0);
  });

  it('stays unknown for every scope of a record absent from the engine set', () => {
    const values = { contract: null, products: {} };
    expect(scopeValueFor(values, null)).toBeNull();
    expect(scopeValueFor(values, 7)).toBeNull();
  });
});

describe('applicableScopes', () => {
  const scopes = [
    { productId: null, lines: [] },
    { productId: 7, lines: [] },
    { productId: 8, lines: [] },
  ];

  it('keeps whole-record scopes and only the product scopes the record carries', () => {
    expect(
      applicableScopes(scopes, new Set([7])).map((s) => s.productId),
    ).toEqual([null, 7]);
    expect(applicableScopes(scopes, new Set()).map((s) => s.productId)).toEqual(
      [null],
    );
  });

  it("drops nothing when the record's products are unknown", () => {
    expect(applicableScopes(scopes, null)).toEqual(scopes);
  });
});
