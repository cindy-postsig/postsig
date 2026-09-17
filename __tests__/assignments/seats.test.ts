import { assignmentSeatFrom } from '@/lib/v2/assignments/seats';
import type { Seat } from '@/lib/v2/seats/types';

const contractSeat: Seat = {
  id: 10,
  source: 'contract_user',
  contractId: 100,
  productId: 200,
  catalogProductId: 200,
  vendorId: 5,
  vendorName: 'Bloomberg',
  productName: 'Terminal',
  deliveryMethods: ['Desktop'],
  holder: { orgEmployeeId: 1, displayName: 'Ada Lovelace' },
  startDate: '2026-01-15',
  endDate: null,
  inactiveReasons: [],
  underused: false,
};

const terminal: Seat = {
  ...contractSeat,
  id: -266891005,
  source: 'bloomberg_sid',
  contractId: -500,
  productId: -266891005,
  catalogProductId: 1234,
  productName: 'Bloomberg Anywhere',
  deliveryMethods: ['Terminal'],
  holder: { orgEmployeeId: null, displayName: 'user 492 ffm' },
  startDate: '2000-04-07',
  endDate: '2028-04-07',
  inactiveReasons: ['not_in_hr', 'dormant'],
  underused: true,
};

describe('assignmentSeatFrom', () => {
  it('carries vendor, product and delivery through, and starts the cost at zero', () => {
    expect(assignmentSeatFrom(contractSeat)).toEqual({
      id: 10,
      contractId: 100,
      productId: 200,
      productName: 'Terminal',
      vendorId: 5,
      vendorName: 'Bloomberg',
      deliveryMethods: ['Desktop'],
      orgEmployeeId: 1,
      holderName: 'Ada Lovelace',
      assignedDate: '2026-01-15',
      inactiveReasons: [],
      underused: false,
      monthlyCost: 0,
    });
  });

  it('keeps a terminal on its own negative id but groups it under its product', () => {
    // The id is the engine's, so the two sources cannot collide; the product
    // is the Bloomberg product code, so one product is one row.
    expect(assignmentSeatFrom(terminal)).toMatchObject({
      id: -266891005,
      contractId: -500,
      productId: 1234,
      productName: 'Bloomberg Anywhere',
      deliveryMethods: ['Terminal'],
      assignedDate: '2000-04-07',
    });
  });

  it('leaves an unmatched holder unlinked, with the imported name', () => {
    const seat = assignmentSeatFrom(terminal);
    expect(seat.orgEmployeeId).toBeNull();
    expect(seat.holderName).toBe('user 492 ffm');
    expect(seat.underused).toBe(true);
  });

  it('carries every reason the seat was flagged for', () => {
    expect(assignmentSeatFrom(terminal).inactiveReasons).toEqual([
      'not_in_hr',
      'dormant',
    ]);
  });

  it('carries a terminal’s exchange names, with their share of cost still to be priced', () => {
    expect(
      assignmentSeatFrom({
        ...terminal,
        entitlements: {
          exchanges: [
            { code: 'CBOE', name: 'Cboe Europe L1', monthlyCost: 30 },
          ],
          productId: -1,
        },
      }).entitlements,
    ).toEqual({
      exchanges: [{ code: 'CBOE', name: 'Cboe Europe L1', monthlyCost: 0 }],
      monthlyCost: 0,
    });
  });
});
