import { describe, expect, it, jest } from '@jest/globals';

// contract-lineage-strategies reaches the email module, which is `server-only`.
// canParentContractType itself is pure.
jest.mock('@/app/lib/emails/contract-lineage', () => ({
  __esModule: true,
  sendContractLineageEmail: jest.fn(),
}));

import {
  baseContractTypeId,
  contractTypes,
  isExchangeAgreementType,
  isInvoiceType,
  isServiceOrderType,
  INVOICE_TYPE_IDS,
  UNEXECUTED_EXCLUDED_TYPE_IDS,
  SERVICE_ORDER_TYPE_IDS,
  typeIdInList,
} from '@/app/lib/constants';
import { filterExcludeInvoices } from '@/lib/v2/core/filters';
import { canParentContractType } from '@/app/lib/actions/contract-lineage-strategies';

/**
 * The whole point of these helpers is that a bare `type_id === 6` silently drops
 * Exchange Agreement Invoices out of reports, filters and folders. Each case here
 * stands in for a class of call site that used to hold that literal.
 */
describe('contract type groups', () => {
  it('assigns the Exchange Agreement types their own ids', () => {
    expect(contractTypes.EAFeeSchedule).toBe(10);
    // 11 is Lease, which already existed in production.
    expect(contractTypes.Lease).toBe(11);
    expect(contractTypes.EASO).toBe(12);
    expect(contractTypes.EAINV).toBe(13);
  });

  it('treats both invoice types as invoices', () => {
    expect(isInvoiceType(contractTypes.Invoice)).toBe(true);
    expect(isInvoiceType(contractTypes.EAINV)).toBe(true);
    expect(INVOICE_TYPE_IDS).toEqual([6, 13]);
  });

  it('treats both service order types as service orders', () => {
    expect(isServiceOrderType(contractTypes.SO)).toBe(true);
    expect(isServiceOrderType(contractTypes.EASO)).toBe(true);
    expect(SERVICE_ORDER_TYPE_IDS).toEqual([2, 12]);
  });

  it('does not classify unrelated types as invoices or service orders', () => {
    for (const typeId of [
      contractTypes.MSA,
      contractTypes.Addendum,
      contractTypes.TOS,
      contractTypes.NDA,
      contractTypes.EAFeeSchedule,
      contractTypes.Lease,
    ]) {
      expect(isInvoiceType(typeId)).toBe(false);
      expect(isServiceOrderType(typeId)).toBe(false);
    }
  });

  it('treats null and undefined as no type rather than a match', () => {
    expect(isInvoiceType(null)).toBe(false);
    expect(isInvoiceType(undefined)).toBe(false);
    expect(isServiceOrderType(null)).toBe(false);
    expect(isExchangeAgreementType(null)).toBe(false);
  });

  it('recognises all three Exchange Agreement types', () => {
    expect(isExchangeAgreementType(contractTypes.EAFeeSchedule)).toBe(true);
    expect(isExchangeAgreementType(contractTypes.EASO)).toBe(true);
    expect(isExchangeAgreementType(contractTypes.EAINV)).toBe(true);
    expect(isExchangeAgreementType(contractTypes.SO)).toBe(false);
    expect(isExchangeAgreementType(contractTypes.Invoice)).toBe(false);
    expect(isExchangeAgreementType(contractTypes.Lease)).toBe(false);
  });
});

describe('baseContractTypeId', () => {
  it('maps Exchange Agreement types onto the type they mirror', () => {
    expect(baseContractTypeId(contractTypes.EASO)).toBe(contractTypes.SO);
    expect(baseContractTypeId(contractTypes.EAINV)).toBe(contractTypes.Invoice);
  });

  it('leaves every other type untouched', () => {
    for (const typeId of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      expect(baseContractTypeId(typeId)).toBe(typeId);
    }
  });
});

describe('typeIdInList', () => {
  it('renders a PostgREST in-filter list', () => {
    expect(typeIdInList(INVOICE_TYPE_IDS)).toBe('(6,13)');
    expect(typeIdInList(UNEXECUTED_EXCLUDED_TYPE_IDS)).toBe('(4,5,6,13,10)');
  });
});

describe('filterExcludeInvoices', () => {
  it('excludes Exchange Agreement Invoices alongside regular ones', () => {
    const contracts = [
      { id: 1, type_id: contractTypes.MSA },
      { id: 2, type_id: contractTypes.Invoice },
      { id: 3, type_id: contractTypes.EAINV },
      { id: 4, type_id: contractTypes.EASO },
    ];
    expect(filterExcludeInvoices(contracts).map((c) => c.id)).toEqual([1, 4]);
  });

  it('reads the nested contract shape too', () => {
    const contracts = [
      { id: 1, contract: { type_id: contractTypes.EAINV } },
      { id: 2, contract: { type_id: contractTypes.EASO } },
    ];
    expect(filterExcludeInvoices(contracts).map((c) => c.id)).toEqual([2]);
  });
});

/**
 * Without this an Exchange Agreement Invoice never links to its Service Order,
 * so it never gets a parent, so the discrepancy report has nothing to compare
 * and the invoice silently shows no discrepancy at all.
 */
describe('canParentContractType with Exchange Agreement types', () => {
  it('lets an Exchange Agreement Service Order parent an Exchange Agreement Invoice', () => {
    expect(canParentContractType(contractTypes.EASO, contractTypes.EAINV)).toBe(
      true,
    );
  });

  it('allows the mixed combinations, since the hierarchy level is the same', () => {
    expect(canParentContractType(contractTypes.SO, contractTypes.EAINV)).toBe(
      true,
    );
    expect(
      canParentContractType(contractTypes.EASO, contractTypes.Invoice),
    ).toBe(true);
  });

  it('parents an Exchange Agreement Service Order like a regular one', () => {
    expect(canParentContractType(contractTypes.MSA, contractTypes.EASO)).toBe(
      true,
    );
    expect(canParentContractType(contractTypes.SO, contractTypes.EASO)).toBe(
      true,
    );
    expect(canParentContractType(contractTypes.NDA, contractTypes.EASO)).toBe(
      false,
    );
  });

  it('still refuses an invoice as a parent', () => {
    expect(
      canParentContractType(contractTypes.EAINV, contractTypes.EAINV),
    ).toBe(false);
    expect(
      canParentContractType(contractTypes.Invoice, contractTypes.EAINV),
    ).toBe(false);
  });

  it('leaves the pre-existing rules intact', () => {
    expect(
      canParentContractType(contractTypes.MSA, contractTypes.Invoice),
    ).toBe(true);
    expect(canParentContractType(contractTypes.MSA, contractTypes.SO)).toBe(
      true,
    );
    expect(
      canParentContractType(contractTypes.MSA, contractTypes.Operational),
    ).toBe(true);
    expect(
      canParentContractType(contractTypes.TOS, contractTypes.Invoice),
    ).toBe(false);
  });
});
