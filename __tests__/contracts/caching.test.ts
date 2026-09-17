import { describe, expect, it, jest } from '@jest/globals';
import { filterContracts } from '@/app/lib/contracts/filtering';
import { contractOwners, ownerSponsorNames } from '@/lib/v2/owners/embed';

jest.mock('@/utils/pino', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  error: jest.fn(),
}));

const sponsorOwnerRows = (names: readonly string[]) =>
  names.map((label, index) => ({
    id: index + 1,
    role: 'sponsor',
    user_id: null,
    org_employee_id: null,
    label,
    org_unit_id: null,
  }));

const mockContracts = [
  {
    id: 1,
    title: 'Microsoft Office Contract',
    status: 'active',
    status_id: 4,
    contract_status: 4,
    renewal_type: 'Auto',
    ai_extraction_status: 'completed',
    cancel_by_date: [{ date: '2025-01-15' }],
    term_end_date: [{ date: '2025-02-15' }],
    term_start_date: [{ date: '2024-02-15' }],
    vendor_products_details: [
      { product_name: 'Office 365' },
      { product_name: 'Teams' },
    ],
    vendors: { name: 'Microsoft' },
    contract_types: { name: 'Software License' },
    contract_owners: sponsorOwnerRows(['John Doe', 'user-456']),
  },
  {
    id: 2,
    title: 'Adobe Creative Suite',
    status: 'failed',
    status_id: 3,
    contract_status: 3,
    renewal_type: 'Manual',
    ai_extraction_status: 'ai_failed',
    cancel_by_date: null,
    term_end_date: [{ date: '2024-12-31' }],
    term_start_date: '2024-01-01',
    vendor_products_details: [
      { product_name: 'Photoshop' },
      { product_name: 'Illustrator' },
    ],
    vendors: { name: 'Adobe' },
    contract_types: { name: 'John Doe' },
    contract_owners: sponsorOwnerRows(['John Doe']),
  },
  {
    id: 3,
    title: 'Salesforce CRM License',
    status: 'unconfirmed',
    status_id: 2,
    contract_status: 2,
    renewal_type: 'Auto',
    ai_extraction_status: 'h_failed',
    cancel_by_date: [{ date: '2025-02-01' }],
    term_end_date: [{ date: '2025-04-01' }],
    term_start_date: [{ date: '2024-04-01' }],
    vendor_products_details: [{ product_name: 'Sales Cloud' }],
    vendors: { name: 'Salesforce' },
    contract_types: { name: 'SaaS Agreement' },
    contract_owners: sponsorOwnerRows(['user-123', 'user-999']),
  },
  {
    id: 4,
    title: 'AWS Infrastructure',
    status: 'active',
    status_id: 4,
    contract_status: 4,
    renewal_type: 'Manual',
    ai_extraction_status: 'completed',
    cancel_by_date: null,
    term_end_date: null,
    term_start_date: [{ date: '2023-06-15' }],
    vendor_products_details: [{ product_name: 'EC2' }, { product_name: 'S3' }],
    vendors: { name: 'Amazon Web Services' },
    contract_types: { name: 'Cloud Services' },
    contract_owners: [],
  },
];

const mockUserMetadata = {
  userId: 'user-123',
  organizationId: 'org-456',
  userRole: 'admin',
  userProfile: {
    name: 'John Doe',
    email: 'john.doe@example.com',
  },
};

describe('Contract Filtering System', () => {
  describe('filterContracts', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    describe('hideFailed filter', () => {
      it('should filter out contracts with ai_failed status', () => {
        const result = filterContracts(mockContracts, { hideFailed: true });

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 4]);
        expect(
          result.every(
            (c) => !['ai_failed', 'h_failed'].includes(c.ai_extraction_status),
          ),
        ).toBe(true);
      });

      it('should filter out contracts with h_failed status', () => {
        const contractsWithHFailed = [...mockContracts];
        const result = filterContracts(contractsWithHFailed, {
          hideFailed: true,
        });

        expect(result).toHaveLength(2);
        expect(
          result.every(
            (c) => !['ai_failed', 'h_failed'].includes(c.ai_extraction_status),
          ),
        ).toBe(true);
      });

      it('should return all contracts when hideFailed is false', () => {
        const result = filterContracts(mockContracts, { hideFailed: false });

        expect(result).toHaveLength(mockContracts.length);
      });
    });

    describe('isPending filter', () => {
      it('should filter out contracts with status_id = 4 when isPending is true', () => {
        const result = filterContracts(mockContracts, { isPending: true });

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([2, 3]);
        expect(result.every((c) => c.status_id !== 4)).toBe(true);
      });

      it('should return all contracts when isPending is false', () => {
        const result = filterContracts(mockContracts, { isPending: false });

        expect(result).toHaveLength(mockContracts.length);
      });
    });

    describe('contractStatus filter', () => {
      it('should filter contracts by status_id when contractStatus is provided', () => {
        const result = filterContracts(mockContracts, { contractStatus: 4 });

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 4]);
        expect(result.every((c) => c.status_id === 4)).toBe(true);
      });

      it('should not apply contractStatus filter when isPending is true', () => {
        const result = filterContracts(mockContracts, {
          isPending: true,
          contractStatus: 4,
        });

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([2, 3]);
        expect(result.every((c) => c.status_id !== 4)).toBe(true);
      });

      it('should return empty array when no contracts match status', () => {
        const result = filterContracts(mockContracts, { contractStatus: 999 });

        expect(result).toHaveLength(0);
      });
    });

    describe('status filter', () => {
      it('should filter contracts by status field', () => {
        const result = filterContracts(mockContracts, { status: 'active' });

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 4]);
        expect(result.every((c) => c.status === 'active')).toBe(true);
      });

      it('should filter contracts by unconfirmed status', () => {
        const result = filterContracts(mockContracts, {
          status: 'unconfirmed',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(3);
        expect(result[0].status).toBe('unconfirmed');
      });
    });

    describe('renewalType filter', () => {
      it('should filter contracts by Auto renewal type', () => {
        const result = filterContracts(mockContracts, { renewalType: 'Auto' });

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 3]);
        expect(result.every((c) => c.renewal_type === 'Auto')).toBe(true);
      });

      it('should filter contracts by Manual renewal type', () => {
        const result = filterContracts(mockContracts, {
          renewalType: 'Manual',
        });

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([2, 4]);
        expect(result.every((c) => c.renewal_type === 'Manual')).toBe(true);
      });
    });

    describe('range filter', () => {
      beforeEach(() => {
        jest.clearAllMocks();
      });

      afterEach(() => {
        jest.useRealTimers();
      });

      it('should filter contracts within date range based on cancel_by_date or term_end_date', () => {
        // Set system time to Dec 1, 2024
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2024-12-01'));

        // 90 days from 2024-12-01 should include contracts expiring before 2025-03-01
        const result = filterContracts(mockContracts, { range: 90 });

        // The range filter includes contracts that have cancel_by_date OR term_end_date within range
        // Contract 1: cancel_by_date 2025-01-15 (within 90 days from 2024-12-01)
        // Contract 2: term_end_date 2024-12-31 (within 90 days from 2024-12-01)
        // Contract 3: cancel_by_date 2025-02-01 (not within 90 days from 2024-12-01)
        // Contract 4: no cancel_by_date or term_end_date, so excluded
        expect(result).toHaveLength(3);
        expect(result.map((c) => c.id).sort()).toEqual([1, 2, 3]);
      });

      it('should return empty array when no contracts are within range', () => {
        // Set system time far in the future
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2025-12-01'));

        const result = filterContracts(mockContracts, { range: 30 });

        expect(result).toHaveLength(0);
      });

      it('should ignore range filter when range is 0 or negative', () => {
        const result1 = filterContracts(mockContracts, { range: 0 });
        const result2 = filterContracts(mockContracts, { range: -10 });

        expect(result1).toHaveLength(mockContracts.length);
        expect(result2).toHaveLength(mockContracts.length);
      });
    });

    describe('myContractsOnly filter', () => {
      it('should filter contracts where user is assigned', () => {
        const result = filterContracts(
          mockContracts,
          { myContractsOnly: true },
          mockUserMetadata,
        );

        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 2]);
        expect(
          result.every((c) =>
            ownerSponsorNames(contractOwners(c)).some(
              (sponsor) =>
                sponsor === mockUserMetadata.userProfile?.name ||
                sponsor === mockUserMetadata.userProfile?.email,
            ),
          ),
        ).toBe(true);
      });

      it('should return all contracts when userMetadata is not provided', () => {
        const result = filterContracts(mockContracts, {
          myContractsOnly: true,
        });

        expect(result).toHaveLength(mockContracts.length);
      });

      it('should return all contracts when myContractsOnly is false', () => {
        const result = filterContracts(
          mockContracts,
          { myContractsOnly: false },
          mockUserMetadata,
        );

        expect(result).toHaveLength(mockContracts.length);
      });
    });

    describe('contractFields filter', () => {
      it('should add missing fields as null to contracts', () => {
        const result = filterContracts(mockContracts, {
          contractFields: [
            'renewal_period',
            'billing_frequency',
            'annual_increase',
          ],
        });

        expect(result).toHaveLength(mockContracts.length);
        result.forEach((contract) => {
          expect(contract).toHaveProperty('renewal_period', null);
          expect(contract).toHaveProperty('billing_frequency', null);
          expect(contract).toHaveProperty('annual_increase', null);
        });
      });

      it('should not modify contracts when contractFields is empty', () => {
        const result = filterContracts(mockContracts, { contractFields: [] });

        expect(result).toHaveLength(mockContracts.length);
        expect(result).toEqual(mockContracts);
      });

      it('should not add fields that already exist', () => {
        const result = filterContracts(mockContracts, {
          contractFields: ['title', 'status', 'new_field'],
        });

        expect(result).toHaveLength(mockContracts.length);
        result.forEach((contract) => {
          expect(contract.title).toBeDefined();
          expect(contract.status).toBeDefined();
          expect(contract).toHaveProperty('new_field', null);
        });
      });
    });

    describe('query filter', () => {
      it('should filter contracts by title search', () => {
        const result = filterContracts(mockContracts, { query: 'Microsoft' });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
        expect(result[0].title).toContain('Microsoft');
      });

      it('should filter contracts by vendor name search', () => {
        const result = filterContracts(mockContracts, { query: 'adobe' });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(2);
        expect(result[0].vendors.name).toBe('Adobe');
      });

      it('should filter contracts by product name search', () => {
        const result = filterContracts(mockContracts, { query: 'office 365' });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
        expect(
          result[0].vendor_products_details.some(
            (p: any) => p.product_name === 'Office 365',
          ),
        ).toBe(true);
      });

      it('should filter contracts by contract type search', () => {
        const result = filterContracts(mockContracts, {
          query: 'software license',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
        expect(result[0].contract_types.name).toBe('Software License');
      });

      it('should be case insensitive', () => {
        const result = filterContracts(mockContracts, { query: 'SALESFORCE' });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(3);
      });

      it('should return empty array when no matches found', () => {
        const result = filterContracts(mockContracts, {
          query: 'NonexistentVendor',
        });

        expect(result).toHaveLength(0);
      });
    });

    describe('date range filter', () => {
      it('should filter contracts by start and end date', () => {
        const result = filterContracts(mockContracts, {
          startDate: '2024-02-01',
          endDate: '2024-04-30',
        });

        // Should include contracts 1 and 3 based on their term_start_date
        expect(result).toHaveLength(2);
        expect(result.map((c) => c.id)).toEqual([1, 3]);
      });

      it('should return empty array when no contracts match date range', () => {
        const result = filterContracts(mockContracts, {
          startDate: '2025-12-01',
          endDate: '2025-12-31',
        });

        expect(result).toHaveLength(0);
      });

      it('should ignore date filter when only startDate is provided', () => {
        const result = filterContracts(mockContracts, {
          startDate: '2024-01-01',
        });

        expect(result).toHaveLength(mockContracts.length);
      });

      it('should ignore date filter when only endDate is provided', () => {
        const result = filterContracts(mockContracts, {
          endDate: '2024-12-31',
        });

        expect(result).toHaveLength(mockContracts.length);
      });
    });

    describe('multiple filters combination', () => {
      it('should apply multiple filters correctly', () => {
        const result = filterContracts(mockContracts, {
          hideFailed: true,
          contractStatus: 4,
          renewalType: 'Auto',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
      });

      it('should handle complex filter combination', () => {
        const result = filterContracts(
          mockContracts,
          {
            status: 'active',
            query: 'office',
            myContractsOnly: true,
          },
          mockUserMetadata,
        );

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
      });

      it('should return empty array when filters exclude all contracts', () => {
        const result = filterContracts(mockContracts, {
          status: 'active',
          contractStatus: 3, // No active contracts with status_id 3
        });

        expect(result).toHaveLength(0);
      });
    });

    describe('edge cases', () => {
      it('should handle empty contracts array', () => {
        const result = filterContracts([], { hideFailed: true });

        expect(result).toHaveLength(0);
      });

      it('should handle contracts with missing properties', () => {
        const incompleteContracts = [
          { id: 1, title: 'Incomplete Contract' },
          { id: 2, title: 'Another Contract' },
        ];

        const result = filterContracts(incompleteContracts, {
          query: 'incomplete',
        });

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe(1);
      });

      it('should handle null and undefined filter values', () => {
        const result = filterContracts(mockContracts, {
          status: undefined,
          renewalType: null as any,
          query: '',
          range: undefined,
        });

        expect(result).toHaveLength(mockContracts.length);
      });
    });

    describe('performance logging', () => {
      it('should log filtering performance metrics', () => {
        const mockDebug = jest.fn();
        const logger = require('@/utils/pino');
        logger.debug = mockDebug;

        filterContracts(mockContracts, { hideFailed: true });

        expect(mockDebug).toHaveBeenCalledWith(
          expect.objectContaining({
            originalCount: mockContracts.length,
            filteredCount: expect.any(Number),
            processingTime: expect.any(Number),
            filters: ['hideFailed'],
          }),
          'Filtered contracts client-side',
        );
      });

      it('should log multiple filters in metrics', () => {
        const mockDebug = jest.fn();
        const logger = require('@/utils/pino');
        logger.debug = mockDebug;

        filterContracts(mockContracts, {
          hideFailed: true,
          status: 'active',
          renewalType: 'Auto',
        });

        expect(mockDebug).toHaveBeenCalledWith(
          expect.objectContaining({
            filters: expect.arrayContaining([
              'hideFailed',
              'status',
              'renewalType',
            ]),
          }),
          'Filtered contracts client-side',
        );
      });
    });

    describe('return all contracts when no filters applied', () => {
      it('should return all contracts with empty options', () => {
        const result = filterContracts(mockContracts, {});

        expect(result).toHaveLength(mockContracts.length);
        expect(result).toEqual(mockContracts);
      });

      it('should return all contracts with no options parameter', () => {
        const result = filterContracts(mockContracts);

        expect(result).toHaveLength(mockContracts.length);
        expect(result).toEqual(mockContracts);
      });
    });
  });
});
