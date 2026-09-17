import type { Contract } from '@/app/lib/budget/types';
import type { ContractWithPricing } from '@/lib/v2/core/types';
import { enrichWithEngineSpend, type CurrencyPolicy } from '@/lib/v2/spend';
import { filterToFamily } from '@/lib/v2/contracts/service';
import { contractTypes } from '@/app/lib/constants';

/**
 * The assumption familyOf rests on: a contract's engine stamp depends only on
 * its relationship family, so running the engine over the family alone
 * reproduces the full-org stamps for every member, cent for cent.
 */

const USD: CurrencyPolicy = { mode: 'preconverted-usd' };
const ASOF = new Date('2026-07-01T00:00:00Z');
const FISCAL_START = 1;

function makeContract(spec: {
  id: number;
  termStart: string;
  termEnd: string;
  fees: number;
  typeId?: number;
  annualIncrease?: number;
}): Contract {
  return {
    id: spec.id,
    vendor_id: 10,
    type_id: spec.typeId ?? contractTypes.MSA,
    status: 'active',
    status_id: 4,
    currency: 'usd',
    annual_increase: spec.annualIncrease ?? null,
    annual_increase_months: null,
    subscription_term: 12,
    renewal_period: 12,
    renewal_type: 'Auto',
    billing_frequency: 'Annually',
    will_not_renew: false,
    term_start_date: [{ date: spec.termStart }],
    term_end_date: [{ date: spec.termEnd }],
    cancel_date: [],
    cancel_by_date: null,
    vendor_products_details: [
      {
        product_id: 100 + spec.id,
        year: 1,
        fees: spec.fees,
        vendor_products: { id: 100 + spec.id, name: `Product ${spec.id}` },
      },
    ],
    vendors: { name: 'Test Vendor' },
  } as unknown as Contract;
}

const enriched = (contract: Contract): ContractWithPricing =>
  ({
    id: contract.id as number,
    vendor_id: 10,
    vendor_name: 'Test Vendor',
    contract,
    products: [],
    priceHistory: null,
    isLinkedChildInvoice: false,
  }) as unknown as ContractWithPricing;

describe('familyOf engine parity', () => {
  it('family-scoped stamps equal the full-run stamps for every family member', () => {
    // Family: MSA 1 → amendment 2 → invoice 3; unrelated contracts 4 and 5
    // share the vendor and overlap the window.
    const contracts = [
      makeContract({
        id: 1,
        termStart: '2025-11-01',
        termEnd: '2026-10-31',
        fees: 100_000,
        annualIncrease: 10,
      }),
      makeContract({
        id: 2,
        termStart: '2026-01-01',
        termEnd: '2026-10-31',
        fees: 25_000,
      }),
      makeContract({
        id: 3,
        termStart: '2026-02-01',
        termEnd: '2026-02-28',
        fees: 8_333,
        typeId: contractTypes.Invoice,
      }),
      makeContract({
        id: 4,
        termStart: '2026-01-01',
        termEnd: '2026-12-31',
        fees: 50_000,
      }),
      makeContract({
        id: 5,
        termStart: '2025-06-01',
        termEnd: '2027-05-31',
        fees: 70_000,
      }),
    ].map(enriched);
    const relationships = [
      { parent_contract_id: 1, child_contract_id: 2, relationship_type: null },
      {
        parent_contract_id: 2,
        child_contract_id: 3,
        relationship_type: null,
      },
      { parent_contract_id: 4, child_contract_id: 5, relationship_type: null },
    ];

    const options = { currency: USD, productValues: true };
    const full = enrichWithEngineSpend(
      contracts,
      relationships,
      FISCAL_START,
      ASOF,
      options,
    );

    const family = filterToFamily(contracts, 3, relationships);
    expect(family.map((c) => c.id)).toEqual([1, 2, 3]);
    const familyRelationships = relationships.filter(
      (rel) => rel.parent_contract_id !== 4,
    );
    const scoped = enrichWithEngineSpend(
      family,
      familyRelationships,
      FISCAL_START,
      ASOF,
      options,
    );

    for (const id of [1, 2, 3]) {
      const fullStamp = full.find((c) => c.id === id)?.engineSpend;
      const scopedStamp = scoped.find((c) => c.id === id)?.engineSpend;
      expect(fullStamp).toBeDefined();
      expect(scopedStamp).toEqual(fullStamp);
    }
  });
});
