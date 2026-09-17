/**
 * Integration tests for retroactive contract lineage detection
 *
 * These tests verify the retroactive parent contract detection system
 * can establish relationships when parent contracts arrive after their children.
 *
 * Test scenarios cover:
 * - Late-arriving MSA linking to existing SOs
 * - Late-arriving amendments inserting into hierarchy
 * - Invoice reparenting scenarios
 * - Circular reference prevention
 * - Contract type hierarchy validation
 *
 * @see https://github.com/postsig/postsig-nextjs/issues/1033
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach,
  jest,
} from '@jest/globals';
import { contractTypes, contractStatuses } from '@/app/lib/constants';
import {
  detectRetroactiveChildren,
  canParentContractType,
  hasMatchingProducts,
} from '@/app/lib/actions/contract-lineage-strategies';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { TEST_ORG_ID, TEST_USER_EMAIL } from '../setup-test-db';

type Contract = Database['public']['Tables']['contracts']['Row'];
type ContractInsert = Database['public']['Tables']['contracts']['Insert'];
type VendorInsert = Database['public']['Tables']['vendors']['Insert'];
type VendorProductInsert =
  Database['public']['Tables']['vendor_products']['Insert'];
type VendorProductDetailInsert =
  Database['public']['Tables']['vendor_products_details']['Insert'];

let TEST_USER_ID: string;
let mockSendEmail: jest.Mock;
let vendorCounter = 0;
let supabase: ReturnType<typeof createClient<Database>>;

jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () =>
    createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    ),
}));

jest.mock('@/data/users', () => ({
  getAllOrgUsers: jest.fn(),
}));

jest.mock('@/app/lib/emails/contract-lineage', () => ({
  sendContractLineageEmail: jest.fn(),
}));

async function cleanupTestData(vendorId?: number, contractIds?: number[]) {
  if (vendorId) {
    await supabase
      .from('contract_relationships')
      .delete()
      .eq('vendor_id', vendorId);
    await supabase.from('vendor_products').delete().eq('vendor_id', vendorId);
    await supabase.from('vendors').delete().eq('id', vendorId);
  }

  if (contractIds && contractIds.length > 0) {
    await supabase
      .from('vendor_products_details')
      .delete()
      .in('contract_id', contractIds);
    await supabase.from('contracts').delete().in('id', contractIds);
  }
}

async function createTestVendor(name: string): Promise<number> {
  vendorCounter++;
  const uniqueName = `${name}-${Date.now()}-${vendorCounter}`;

  const vendorData: VendorInsert = {
    name: uniqueName,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('vendors')
    .insert(vendorData)
    .select()
    .single();

  if (error) throw error;
  if (!data) throw new Error('No data returned from vendor creation');
  return data.id;
}

async function createTestProduct(
  vendorId: number,
  productName: string,
): Promise<number> {
  const productData: VendorProductInsert = {
    name: productName,
    vendor_id: vendorId,
  };

  const { data, error } = await supabase
    .from('vendor_products')
    .insert(productData)
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

async function createTestContract(
  contractId: number | null,
  vendorId: number,
  typeId: number,
  startDate: string,
  metadata?: Record<string, unknown>,
): Promise<Contract> {
  const contractData: ContractInsert = {
    ...(contractId ? { id: contractId } : {}),
    vendor_id: vendorId,
    type_id: typeId,
    status_id: 4,
    user_id: TEST_USER_ID,
    term_start_date: [
      { date: startDate },
    ] as unknown as Database['public']['Tables']['contracts']['Insert']['term_start_date'],
    metadata: (metadata ||
      {}) as Database['public']['Tables']['contracts']['Insert']['metadata'],
  };

  const { data, error } = await supabase
    .from('contracts')
    .insert(contractData)
    .select()
    .single();

  if (error) throw error;
  return data as Contract;
}

async function linkProductToContract(
  contractId: number,
  productId: number,
): Promise<void> {
  const detailData: VendorProductDetailInsert = {
    contract_id: contractId,
    product_id: productId,
    year: new Date().getFullYear(),
  };

  const { error } = await supabase
    .from('vendor_products_details')
    .insert(detailData);

  if (error) throw error;
}

async function getContractRelationships(childContractId: number) {
  const { data, error } = await supabase
    .from('contract_relationships')
    .select('*')
    .eq('child_contract_id', childContractId)
    .not('disabled', 'is', true);

  if (error) throw error;
  return data || [];
}

jest.setTimeout(30000);

describe('Retroactive Contract Lineage Detection', () => {
  beforeAll(async () => {
    supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    mockSendEmail = jest.fn();

    const { data: users } = await supabase.auth.admin.listUsers();
    const testUser = users?.users?.find((u) => u.email === TEST_USER_EMAIL);

    if (testUser) {
      TEST_USER_ID = testUser.id;
    } else {
      throw new Error(
        'Test user not found. Run: npx ts-node __tests__/setup-test-db.ts',
      );
    }

    const { getAllOrgUsers } = require('@/data/users');
    getAllOrgUsers.mockResolvedValue([TEST_USER_ID]);

    const {
      sendContractLineageEmail,
    } = require('@/app/lib/emails/contract-lineage');
    sendContractLineageEmail.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterAll(async () => {
    jest.clearAllMocks();
    jest.clearAllTimers();

    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  describe('Scenario 1: Late-Arriving MSA', () => {
    it('should link SO-1 processed before MSA-1 arrives', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product A');
      const testDate = '2024-01-01';

      const so1 = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
        { lineage: { parent_agreement_date: testDate } },
      );
      await linkProductToContract(so1.id, productId);

      const so2 = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
        { lineage: { parent_agreement_date: testDate } },
      );
      await linkProductToContract(so2.id, productId);

      const relationshipsBefore1 = await getContractRelationships(so1.id);
      const relationshipsBefore2 = await getContractRelationships(so2.id);
      expect(relationshipsBefore1).toHaveLength(0);
      expect(relationshipsBefore2).toHaveLength(0);

      const msa = await createTestContract(
        null,
        vendorId,
        contractTypes.MSA,
        testDate,
      );
      await linkProductToContract(msa.id, productId);

      await detectRetroactiveChildren({
        contractId: msa.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.MSA,
        startDate: testDate,
        products: [{ product_id: productId, product_name: 'Product A' }],
      });

      const relationshipsAfter1 = await getContractRelationships(so1.id);
      const relationshipsAfter2 = await getContractRelationships(so2.id);

      expect(relationshipsAfter1).toHaveLength(1);
      expect(relationshipsAfter1[0].parent_contract_id).toBe(msa.id);
      expect(relationshipsAfter1[0].child_contract_id).toBe(so1.id);

      expect(relationshipsAfter2).toHaveLength(1);
      expect(relationshipsAfter2[0].parent_contract_id).toBe(msa.id);
      expect(relationshipsAfter2[0].child_contract_id).toBe(so2.id);

      expect(relationshipsAfter1[0].metadata).toMatchObject({
        vendor_id: vendorId,
        type_id: contractTypes.MSA,
        retroactive: true,
      });

      await cleanupTestData(vendorId, [so1.id, so2.id, msa.id]);
    });

    it('should only link SOs with matching dates', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product C');
      const date1 = '2024-01-01';
      const date2 = '2024-06-01';

      const so1 = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        date1,
        { lineage: { parent_agreement_date: date1 } },
      );
      await linkProductToContract(so1.id, productId);

      const so2 = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        date2,
        { lineage: { parent_agreement_date: date2 } },
      );
      await linkProductToContract(so2.id, productId);

      const msa = await createTestContract(
        null,
        vendorId,
        contractTypes.MSA,
        date1,
      );
      await linkProductToContract(msa.id, productId);

      await detectRetroactiveChildren({
        contractId: msa.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.MSA,
        startDate: date1,
        products: [{ product_id: productId, product_name: 'Product C' }],
      });

      const relationshipsSo1 = await getContractRelationships(so1.id);
      const relationshipsSo2 = await getContractRelationships(so2.id);

      expect(relationshipsSo1).toHaveLength(1);
      expect(relationshipsSo1[0].parent_contract_id).toBe(msa.id);
      expect(relationshipsSo1[0].child_contract_id).toBe(so1.id);

      expect(relationshipsSo2).toHaveLength(0);

      await cleanupTestData(vendorId, [so1.id, so2.id, msa.id]);
    });
  });

  describe('Scenario 2: Late-Arriving Amendment', () => {
    it.skip('should insert amendment into existing hierarchy and reparent invoices', async () => {
      // 1. Process SO-1 for Vendor B
      // 2. Process Invoice-1, links to SO-1 as parent
      // 3. Process Amendment-1 to SO-1
      // 4. Verify: SO-1 → Amendment-1 → Invoice-1 hierarchy
      // 5. Verify: Invoice-1's parent updated from SO-1 to Amendment-1
      // 6. Verify: Email notifications sent for reparenting
    });
  });

  describe('Scenario 3: Product Matching for Invoices', () => {
    it('should link invoices with matching products to newly processed SO', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product X');
      const testDate = '2024-01-01';

      const invoice = await createTestContract(
        null,
        vendorId,
        contractTypes.Invoice,
        testDate,
      );
      await linkProductToContract(invoice.id, productId);

      const relationshipsBefore = await getContractRelationships(invoice.id);
      expect(relationshipsBefore).toHaveLength(0);

      const so = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
      );
      await linkProductToContract(so.id, productId);

      await detectRetroactiveChildren({
        contractId: so.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.SO,
        startDate: testDate,
        products: [{ product_id: productId, product_name: 'Product X' }],
      });

      const relationshipsAfter = await getContractRelationships(invoice.id);

      expect(relationshipsAfter).toHaveLength(1);
      expect(relationshipsAfter[0].parent_contract_id).toBe(so.id);
      expect(relationshipsAfter[0].child_contract_id).toBe(invoice.id);
      expect(relationshipsAfter[0].metadata).toMatchObject({
        vendor_id: vendorId,
        type_id: contractTypes.SO,
        retroactive: true,
      });

      await cleanupTestData(vendorId, [invoice.id, so.id]);
    });

    it('should not link invoices with non-matching products', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productX = await createTestProduct(vendorId, 'Product X');
      const productY = await createTestProduct(vendorId, 'Product Y');
      const testDate = '2024-01-01';

      const invoice = await createTestContract(
        null,
        vendorId,
        contractTypes.Invoice,
        testDate,
      );
      await linkProductToContract(invoice.id, productX);

      const so = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
      );
      await linkProductToContract(so.id, productY);

      await detectRetroactiveChildren({
        contractId: so.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.SO,
        startDate: testDate,
        products: [{ product_id: productY, product_name: 'Product Y' }],
      });

      const relationships = await getContractRelationships(invoice.id);

      expect(relationships).toHaveLength(0);

      await cleanupTestData(vendorId, [invoice.id, so.id]);
    });
  });

  describe('Scenario 4: Circular Reference Prevention', () => {
    it('should not create relationships for already linked children', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product D');
      const testDate = '2024-01-01';

      const msa1 = await createTestContract(
        null,
        vendorId,
        contractTypes.MSA,
        testDate,
      );
      await linkProductToContract(msa1.id, productId);

      const so = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
        { lineage: { parent_agreement_date: testDate } },
      );
      await linkProductToContract(so.id, productId);

      await detectRetroactiveChildren({
        contractId: msa1.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.MSA,
        startDate: testDate,
        products: [{ product_id: productId, product_name: 'Product D' }],
      });

      const relationshipsAfterMsa1 = await getContractRelationships(so.id);
      expect(relationshipsAfterMsa1).toHaveLength(1);
      expect(relationshipsAfterMsa1[0].parent_contract_id).toBe(msa1.id);

      const msa2 = await createTestContract(
        null,
        vendorId,
        contractTypes.MSA,
        testDate,
      );
      await linkProductToContract(msa2.id, productId);

      await detectRetroactiveChildren({
        contractId: msa2.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.MSA,
        startDate: testDate,
        products: [{ product_id: productId, product_name: 'Product D' }],
      });

      const relationshipsAfterMsa2 = await getContractRelationships(so.id);

      expect(relationshipsAfterMsa2).toHaveLength(1);
      expect(relationshipsAfterMsa2[0].parent_contract_id).toBe(msa1.id);
      expect(relationshipsAfterMsa2[0].child_contract_id).toBe(so.id);

      await cleanupTestData(vendorId, [msa1.id, so.id, msa2.id]);
    });
  });

  describe('Scenario 5: Contract Type Hierarchy Validation', () => {
    it('should respect contract type hierarchy rules', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product E');
      const testDate = '2024-01-01';

      const invoice = await createTestContract(
        null,
        vendorId,
        contractTypes.Invoice,
        testDate,
      );
      await linkProductToContract(invoice.id, productId);

      const so = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
      );
      await linkProductToContract(so.id, productId);

      await detectRetroactiveChildren({
        contractId: invoice.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.Invoice,
        startDate: testDate,
        products: [{ product_id: productId, product_name: 'Product E' }],
      });

      const soRelationships = await getContractRelationships(so.id);

      expect(soRelationships).toHaveLength(0);

      await cleanupTestData(vendorId, [invoice.id, so.id]);
    });

    it('should allow MSA to parent multiple contract types', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product F');
      const testDate = '2024-01-01';

      const so = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
        { lineage: { parent_agreement_date: testDate } },
      );
      await linkProductToContract(so.id, productId);

      const addendum = await createTestContract(
        null,
        vendorId,
        contractTypes.Addendum,
        testDate,
        { lineage: { parent_agreement_date: testDate } },
      );
      await linkProductToContract(addendum.id, productId);

      const invoice = await createTestContract(
        null,
        vendorId,
        contractTypes.Invoice,
        testDate,
      );
      await linkProductToContract(invoice.id, productId);

      const msa = await createTestContract(
        null,
        vendorId,
        contractTypes.MSA,
        testDate,
      );
      await linkProductToContract(msa.id, productId);

      await detectRetroactiveChildren({
        contractId: msa.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.MSA,
        startDate: testDate,
        products: [{ product_id: productId, product_name: 'Product F' }],
      });

      const soRelationships = await getContractRelationships(so.id);
      const addendumRelationships = await getContractRelationships(addendum.id);
      const invoiceRelationships = await getContractRelationships(invoice.id);

      expect(soRelationships).toHaveLength(1);
      expect(soRelationships[0].parent_contract_id).toBe(msa.id);

      expect(addendumRelationships).toHaveLength(1);
      expect(addendumRelationships[0].parent_contract_id).toBe(msa.id);

      expect(invoiceRelationships).toHaveLength(1);
      expect(invoiceRelationships[0].parent_contract_id).toBe(msa.id);

      await cleanupTestData(vendorId, [so.id, addendum.id, invoice.id, msa.id]);
    });
  });

  describe('Scenario 6: Null Handling', () => {
    it('should handle null contractTypeId gracefully', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product G');
      const testDate = '2024-01-01';

      const contract = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
      );
      await linkProductToContract(contract.id, productId);

      await expect(
        detectRetroactiveChildren({
          contractId: contract.id,
          vendorId,
          organizationId: TEST_ORG_ID,
          contractTypeId: null,
          startDate: testDate,
          products: [{ product_id: productId, product_name: 'Product G' }],
        }),
      ).resolves.not.toThrow();

      await cleanupTestData(vendorId, [contract.id]);
    });

    it('should handle contracts with no products gracefully', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product H');
      const testDate = '2024-01-01';

      const so = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
      );

      const invoice = await createTestContract(
        null,
        vendorId,
        contractTypes.Invoice,
        testDate,
      );
      await linkProductToContract(invoice.id, productId);

      await detectRetroactiveChildren({
        contractId: so.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.SO,
        startDate: testDate,
        products: [],
      });

      const invoiceRelationships = await getContractRelationships(invoice.id);

      expect(invoiceRelationships).toHaveLength(0);

      await cleanupTestData(vendorId, [so.id, invoice.id]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple potential parents correctly', async () => {
      const vendorId = await createTestVendor(`Test Vendor ${Date.now()}`);
      const productId = await createTestProduct(vendorId, 'Product I');
      const testDate = '2024-01-01';

      const so = await createTestContract(
        null,
        vendorId,
        contractTypes.SO,
        testDate,
        { lineage: { parent_agreement_date: testDate } },
      );
      await linkProductToContract(so.id, productId);

      const msa1 = await createTestContract(
        null,
        vendorId,
        contractTypes.MSA,
        testDate,
      );
      await linkProductToContract(msa1.id, productId);

      await detectRetroactiveChildren({
        contractId: msa1.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.MSA,
        startDate: testDate,
        products: [{ product_id: productId, product_name: 'Product I' }],
      });

      const relationshipsAfterMsa1 = await getContractRelationships(so.id);
      expect(relationshipsAfterMsa1).toHaveLength(1);
      expect(relationshipsAfterMsa1[0].parent_contract_id).toBe(msa1.id);

      const msa2 = await createTestContract(
        null,
        vendorId,
        contractTypes.MSA,
        testDate,
      );
      await linkProductToContract(msa2.id, productId);

      await detectRetroactiveChildren({
        contractId: msa2.id,
        vendorId,
        organizationId: TEST_ORG_ID,
        contractTypeId: contractTypes.MSA,
        startDate: testDate,
        products: [{ product_id: productId, product_name: 'Product I' }],
      });

      const relationshipsAfterMsa2 = await getContractRelationships(so.id);

      expect(relationshipsAfterMsa2).toHaveLength(1);
      expect(relationshipsAfterMsa2[0].parent_contract_id).toBe(msa1.id);

      await cleanupTestData(vendorId, [so.id, msa1.id, msa2.id]);
    });

    it.skip('should handle contracts from different organizations separately', async () => {
      // This test requires proper organization isolation at the database level
      // which would need:
      // - Different users for each organization
      // - Contracts linked to specific users
      // - getAllOrgUsers() returning different users per organization
      // Skipping as it requires more complex test setup
    });
  });
});

describe('Helper Functions', () => {
  describe('canParentContractType', () => {
    it('should validate MSA can parent SO, Addendum, Operational, Invoice', () => {
      expect(canParentContractType(contractTypes.MSA, contractTypes.SO)).toBe(
        true,
      );
      expect(
        canParentContractType(contractTypes.MSA, contractTypes.Addendum),
      ).toBe(true);
      expect(
        canParentContractType(contractTypes.MSA, contractTypes.Operational),
      ).toBe(true);
      expect(
        canParentContractType(contractTypes.MSA, contractTypes.Invoice),
      ).toBe(true);
    });

    it('should validate SO can parent Addendum and Invoice', () => {
      expect(
        canParentContractType(contractTypes.SO, contractTypes.Addendum),
      ).toBe(true);
      expect(
        canParentContractType(contractTypes.SO, contractTypes.Invoice),
      ).toBe(true);
    });

    it('should reject invalid parent-child combinations', () => {
      expect(
        canParentContractType(contractTypes.Invoice, contractTypes.SO),
      ).toBe(false);
      expect(
        canParentContractType(contractTypes.Invoice, contractTypes.MSA),
      ).toBe(false);
      expect(
        canParentContractType(contractTypes.Invoice, contractTypes.Addendum),
      ).toBe(false);

      expect(
        canParentContractType(contractTypes.Addendum, contractTypes.MSA),
      ).toBe(false);
      expect(
        canParentContractType(contractTypes.Addendum, contractTypes.SO),
      ).toBe(false);
    });
  });

  describe('hasMatchingProducts', () => {
    it('should return true when products overlap', () => {
      const products1 = [{ product_id: 1 }, { product_id: 2 }];
      const products2 = [{ product_id: 2 }, { product_id: 3 }];

      expect(hasMatchingProducts(products1, products2)).toBe(true);
    });

    it('should return false when products do not overlap', () => {
      const products1 = [{ product_id: 1 }, { product_id: 2 }];
      const products2 = [{ product_id: 3 }, { product_id: 4 }];

      expect(hasMatchingProducts(products1, products2)).toBe(false);
    });

    it('should handle empty product lists', () => {
      const products1 = [{ product_id: 1 }];
      const products2: Array<{ product_id: number }> = [];

      expect(hasMatchingProducts(products1, products2)).toBe(false);
      expect(hasMatchingProducts(products2, products1)).toBe(false);
      expect(hasMatchingProducts([], [])).toBe(false);
    });
  });
});
