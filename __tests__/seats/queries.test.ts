import { readContractSeats } from '@/lib/v2/seats/queries';
import { FakeDb, FAKE_ORG_ID } from '../cost-allocation/fake-db';

type ServiceClient = Parameters<typeof readContractSeats>[1];

describe('readContractSeats', () => {
  let db: FakeDb;

  const seedSeat = (row: Record<string, unknown>) =>
    db.insertRow('contract_users', {
      contract_id: 100,
      product_id: 200,
      org_employee_id: 1,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      start_date: '2026-01-15',
      created_at: '2025-11-02T09:00:00.000Z',
      released_at: null,
      contract: {
        organization_id: FAKE_ORG_ID,
        contract_data_delivery_types: [
          { data_delivery_types: { name: 'FTP' } },
        ],
      },
      vendor_products: {
        id: 200,
        name: 'Terminal',
        data_delivery_types: { name: 'Desktop' },
      },
      ...row,
    });

  beforeEach(() => {
    db = new FakeDb();
  });

  const read = (options?: { contractIds?: readonly number[] }) =>
    readContractSeats(FAKE_ORG_ID, db.client() as ServiceClient, options);

  it('scopes to the organization through the contract join', async () => {
    seedSeat({});
    seedSeat({
      name: 'Someone Else',
      contract: { organization_id: 'other-org' },
    });
    const seats = await read();
    expect(seats.map((seat) => seat.name)).toEqual(['Ada Lovelace']);
  });

  it('keeps the organization filter when narrowed to contract ids', async () => {
    seedSeat({});
    seedSeat({
      name: 'Someone Else',
      contract: { organization_id: 'other-org' },
    });
    const seats = await read({ contractIds: [100] });
    expect(seats.map((seat) => seat.name)).toEqual(['Ada Lovelace']);
  });

  it('reads only the contracts asked for, and none at all for an empty list', async () => {
    seedSeat({});
    seedSeat({ contract_id: 101, name: 'Grace Hopper' });

    expect(
      (await read({ contractIds: [101] })).map((seat) => seat.name),
    ).toEqual(['Grace Hopper']);
    expect(await read({ contractIds: [] })).toEqual([]);
  });

  it('excludes released seats', async () => {
    seedSeat({});
    seedSeat({ name: 'Released', released_at: '2026-05-01T00:00:00.000Z' });
    const seats = await read();
    expect(seats.map((seat) => seat.name)).toEqual(['Ada Lovelace']);
  });

  it('drops a seat whose contract went away', async () => {
    seedSeat({ contract_id: null });
    expect(await read()).toEqual([]);
  });

  it('prefers the product’s own delivery method over the contract’s', async () => {
    seedSeat({});
    expect((await read())[0].delivery_methods).toEqual(['Desktop']);
  });

  it('falls back to every method recorded on the contract', async () => {
    seedSeat({
      vendor_products: { id: 200, name: 'Terminal', data_delivery_types: null },
      contract: {
        organization_id: FAKE_ORG_ID,
        contract_data_delivery_types: [
          { data_delivery_types: { name: 'FTP' } },
          { data_delivery_types: { name: 'API' } },
        ],
      },
    });
    expect((await read())[0].delivery_methods).toEqual(['FTP', 'API']);
  });

  it('reads no vendor at all — the caller overlays it', async () => {
    seedSeat({});
    expect(Object.keys((await read())[0])).not.toContain('vendor_name');
  });
});
