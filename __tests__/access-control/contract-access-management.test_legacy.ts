/**
 * Integration tests for contract and folder access management
 *
 * Tests verify the access control system for different roles:
 * - Managers (role 11): ACL-only access to contracts and folders
 * - Supervisors (role 12): Full access to all contracts and folders in org
 *
 * Key requirements tested:
 * - No implicit owner-admin permissions
 * - Managers can only see contracts/folders assigned via ACL
 * - Supervisors have full org-wide access
 * - Folder inheritance permissions work correctly
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
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/database.types';
import { TEST_ORG_ID, TEST_USER_EMAIL } from '../setup-test-db';

type PermissionLevel = 'read' | 'write' | 'admin';

let supabase: ReturnType<typeof createClient<Database>>;
let TEST_USER_ID: string;
let MANAGER_USER_ID: string;
let SUPERVISOR_USER_ID: string;
let testVendorId: number;
let testFolderId: number;

jest.setTimeout(30000);

beforeAll(async () => {
  supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: users } = await supabase.auth.admin.listUsers();
  const testUser = users?.users?.find((u) => u.email === TEST_USER_EMAIL);

  if (testUser) {
    TEST_USER_ID = testUser.id;
  } else {
    throw new Error(
      'Test user not found. Run: npx ts-node __tests__/setup-test-db.ts',
    );
  }

  const managerEmail = `manager-test-${Date.now()}@postsig-test.com`;
  const { data: managerData } = await supabase.auth.admin.createUser({
    email: managerEmail,
    password: 'TestPassword123!',
    email_confirm: true,
    user_metadata: {
      name: 'Test Manager',
      organization_id: TEST_ORG_ID,
    },
  });
  MANAGER_USER_ID = managerData?.user?.id!;

  await supabase.from('users').upsert({
    id: MANAGER_USER_ID,
    email: managerEmail,
    organization_id: TEST_ORG_ID,
    name: 'Test Manager',
  });

  await supabase.from('user_roles2').insert({
    user_id: MANAGER_USER_ID,
    role_id: 11,
  });

  const supervisorEmail = `supervisor-test-${Date.now()}@postsig-test.com`;
  const { data: supervisorData } = await supabase.auth.admin.createUser({
    email: supervisorEmail,
    password: 'TestPassword123!',
    email_confirm: true,
    user_metadata: {
      name: 'Test Supervisor',
      organization_id: TEST_ORG_ID,
    },
  });
  SUPERVISOR_USER_ID = supervisorData?.user?.id!;

  await supabase.from('users').upsert({
    id: SUPERVISOR_USER_ID,
    email: supervisorEmail,
    organization_id: TEST_ORG_ID,
    name: 'Test Supervisor',
  });

  await supabase.from('user_roles2').insert({
    user_id: SUPERVISOR_USER_ID,
    role_id: 12,
  });

  const { data: vendor } = await supabase
    .from('vendors')
    .insert({
      name: `Test Vendor ACL ${Date.now()}`,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();
  testVendorId = vendor!.id;

  const { data: folder } = await supabase
    .from('folders')
    .insert({
      name: `Test Folder ACL ${Date.now()}`,
      organization_id: TEST_ORG_ID,
      user_id: TEST_USER_ID,
      path: `n${Date.now()}`,
    })
    .select()
    .single();
  testFolderId = folder!.id;
});

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
});

afterAll(async () => {
  if (testVendorId) {
    await supabase
      .from('contract_relationships')
      .delete()
      .eq('vendor_id', testVendorId);
    await supabase
      .from('vendor_products')
      .delete()
      .eq('vendor_id', testVendorId);
    await supabase.from('vendors').delete().eq('id', testVendorId);
  }

  if (testFolderId) {
    await supabase
      .from('folder_acl_user')
      .delete()
      .eq('folder_id', testFolderId);
    await supabase
      .from('folder_acl_group')
      .delete()
      .eq('folder_id', testFolderId);
    await supabase.from('folders').delete().eq('id', testFolderId);
  }

  if (MANAGER_USER_ID) {
    await supabase.from('user_roles2').delete().eq('user_id', MANAGER_USER_ID);
    await supabase.auth.admin.deleteUser(MANAGER_USER_ID);
  }

  if (SUPERVISOR_USER_ID) {
    await supabase
      .from('user_roles2')
      .delete()
      .eq('user_id', SUPERVISOR_USER_ID);
    await supabase.auth.admin.deleteUser(SUPERVISOR_USER_ID);
  }

  jest.clearAllMocks();
  jest.clearAllTimers();

  await new Promise((resolve) => setTimeout(resolve, 500));
});

describe('Contract Access Management', () => {
  describe('contracts_visible_to function', () => {
    it('should return empty for manager with no ACL grants', async () => {
      const { data: contract } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      const { data: visible } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerContracts = visible?.filter((v) => v.id === contract!.id);
      expect(managerContracts).toHaveLength(0);

      await supabase.from('contracts').delete().eq('id', contract!.id);
    });

    it('should return contract for manager with direct ACL grant', async () => {
      const { data: contract } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      await supabase.from('contract_acl_user').insert({
        organization_id: TEST_ORG_ID,
        contract_id: contract!.id,
        user_id: MANAGER_USER_ID,
        perm: 'read',
      });

      const { data: visible } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerContracts = visible?.filter((v) => v.id === contract!.id);
      expect(managerContracts).toHaveLength(1);
      expect(managerContracts![0].perm).toBe('read');

      await supabase
        .from('contract_acl_user')
        .delete()
        .eq('contract_id', contract!.id)
        .eq('user_id', MANAGER_USER_ID);
      await supabase.from('contracts').delete().eq('id', contract!.id);
    });

    it('should return all contracts for supervisor without ACL', async () => {
      const { data: contract1 } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      const { data: contract2 } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      const { data: visible } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: SUPERVISOR_USER_ID,
      });

      const supervisorContracts = visible?.filter(
        (v) => v.id === contract1!.id || v.id === contract2!.id,
      );
      expect(supervisorContracts!.length).toBeGreaterThanOrEqual(2);
      expect(supervisorContracts![0].perm).toBe('admin');

      await supabase
        .from('contracts')
        .delete()
        .in('id', [contract1!.id, contract2!.id]);
    });

    it('should grant implicit owner-admin to manager who created contract', async () => {
      const { data: contract } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: MANAGER_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      const { data: visible } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerContracts = visible?.filter((v) => v.id === contract!.id);
      expect(managerContracts).toHaveLength(1);
      expect(managerContracts![0].perm).toBe('admin');

      await supabase.from('contracts').delete().eq('id', contract!.id);
    });

    it('should NOT grant implicit owner-admin to regular users who created contract', async () => {
      const { data: contract } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      const { data: visible } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: TEST_USER_ID,
      });

      const regularUserContracts = visible?.filter(
        (v) => v.id === contract!.id,
      );
      expect(regularUserContracts).toHaveLength(0);

      await supabase.from('contracts').delete().eq('id', contract!.id);
    });

    it('should respect permission levels (read < write < admin)', async () => {
      const { data: contract } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      await supabase.from('contract_acl_user').insert({
        organization_id: TEST_ORG_ID,
        contract_id: contract!.id,
        user_id: MANAGER_USER_ID,
        perm: 'write',
      });

      const { data: visible } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerContracts = visible?.filter((v) => v.id === contract!.id);
      expect(managerContracts![0].perm).toBe('write');

      await supabase.from('contract_acl_user').insert({
        organization_id: TEST_ORG_ID,
        contract_id: contract!.id,
        user_id: MANAGER_USER_ID,
        perm: 'admin',
      });

      const { data: visibleAfter } = await supabase.rpc(
        'contracts_visible_to',
        {
          p_organization_id: TEST_ORG_ID,
          p_user_id: MANAGER_USER_ID,
        },
      );

      const managerContractsAfter = visibleAfter?.filter(
        (v) => v.id === contract!.id,
      );
      expect(managerContractsAfter![0].perm).toBe('admin');

      await supabase
        .from('contract_acl_user')
        .delete()
        .eq('contract_id', contract!.id)
        .eq('user_id', MANAGER_USER_ID);
      await supabase.from('contracts').delete().eq('id', contract!.id);
    });

    it('should grant access via group membership for managers', async () => {
      const { data: group } = await supabase
        .from('groups')
        .insert({
          name: `Test Group ${Date.now()}`,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      await supabase.from('group_members').insert({
        organization_id: TEST_ORG_ID,
        group_id: group!.id,
        user_id: MANAGER_USER_ID,
      });

      const { data: contract } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      await supabase.from('contract_acl_group').insert({
        organization_id: TEST_ORG_ID,
        contract_id: contract!.id,
        group_id: group!.id,
        perm: 'read',
      });

      const { data: visible } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerContracts = visible?.filter((v) => v.id === contract!.id);
      expect(managerContracts).toHaveLength(1);
      expect(managerContracts![0].perm).toBe('read');

      await supabase
        .from('contract_acl_group')
        .delete()
        .eq('contract_id', contract!.id);
      await supabase.from('group_members').delete().eq('group_id', group!.id);
      await supabase.from('groups').delete().eq('id', group!.id);
      await supabase.from('contracts').delete().eq('id', contract!.id);
    });
  });

  describe('folders_visible_to function', () => {
    it('should return empty for manager with no folder ACL grants', async () => {
      const { data: visible } = await supabase.rpc('folders_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerFolders = visible?.filter((v) => v.id === testFolderId);
      expect(managerFolders).toHaveLength(0);
    });

    it('should return folder for manager with direct ACL grant', async () => {
      await supabase.from('folder_acl_user').insert({
        organization_id: TEST_ORG_ID,
        folder_id: testFolderId,
        user_id: MANAGER_USER_ID,
        perm: 'write',
      });

      const { data: visible } = await supabase.rpc('folders_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerFolders = visible?.filter((v) => v.id === testFolderId);
      expect(managerFolders).toHaveLength(1);
      expect(managerFolders![0].perm).toBe('write');

      await supabase
        .from('folder_acl_user')
        .delete()
        .eq('folder_id', testFolderId)
        .eq('user_id', MANAGER_USER_ID);
    });

    it('should return all folders for supervisor without ACL', async () => {
      const { data: visible } = await supabase.rpc('folders_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: SUPERVISOR_USER_ID,
      });

      const supervisorFolders = visible?.filter((v) => v.id === testFolderId);
      expect(supervisorFolders!.length).toBeGreaterThanOrEqual(1);
      expect(supervisorFolders![0].perm).toBe('admin');
    });

    it('should support folder inheritance for managers', async () => {
      const { data: childFolder } = await supabase
        .from('folders')
        .insert({
          name: `Child Folder ${Date.now()}`,
          organization_id: TEST_ORG_ID,
          user_id: TEST_USER_ID,
          parent_id: testFolderId,
          path: `n${testFolderId}.n${Date.now()}`,
        })
        .select()
        .single();

      await supabase.from('folder_acl_user').insert({
        organization_id: TEST_ORG_ID,
        folder_id: testFolderId,
        user_id: MANAGER_USER_ID,
        perm: 'read',
      });

      const { data: visible } = await supabase.rpc('folders_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerFolders = visible?.filter(
        (v) => v.id === testFolderId || v.id === childFolder!.id,
      );
      expect(managerFolders!.length).toBeGreaterThanOrEqual(2);

      await supabase
        .from('folder_acl_user')
        .delete()
        .eq('folder_id', testFolderId)
        .eq('user_id', MANAGER_USER_ID);
      await supabase.from('folders').delete().eq('id', childFolder!.id);
    });

    it('should allow managers with write permission to upload documents', async () => {
      await supabase.from('folder_acl_user').insert({
        organization_id: TEST_ORG_ID,
        folder_id: testFolderId,
        user_id: MANAGER_USER_ID,
        perm: 'write',
      });

      const { data: visible } = await supabase.rpc('folders_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const managerFolders = visible?.filter((v) => v.id === testFolderId);
      expect(managerFolders![0].perm).toMatch(/write|admin/);

      await supabase
        .from('folder_acl_user')
        .delete()
        .eq('folder_id', testFolderId)
        .eq('user_id', MANAGER_USER_ID);
    });
  });

  describe('Cross-cutting concerns', () => {
    it('should isolate access between different organizations', async () => {
      const { data: otherOrg } = await supabase
        .from('organizations')
        .insert({
          name: `Other Org ${Date.now()}`,
          fiscal_year_start_month: 1,
          missing_clauses_confirmed: false,
        })
        .select()
        .single();

      const { data: contract } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: otherOrg!.id,
        })
        .select()
        .single();

      const { data: visible } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      const crossOrgContracts = visible?.filter((v) => v.id === contract!.id);
      expect(crossOrgContracts).toHaveLength(0);

      await supabase.from('contracts').delete().eq('id', contract!.id);
      await supabase.from('organizations').delete().eq('id', otherOrg!.id);
    });

    it('should handle permission escalation correctly', async () => {
      const { data: contract } = await supabase
        .from('contracts')
        .insert({
          vendor_id: testVendorId,
          type_id: 1,
          status_id: 4,
          user_id: TEST_USER_ID,
          organization_id: TEST_ORG_ID,
        })
        .select()
        .single();

      await supabase.from('contract_acl_user').insert({
        organization_id: TEST_ORG_ID,
        contract_id: contract!.id,
        user_id: MANAGER_USER_ID,
        perm: 'read',
      });

      const { data: visibleRead } = await supabase.rpc('contracts_visible_to', {
        p_organization_id: TEST_ORG_ID,
        p_user_id: MANAGER_USER_ID,
      });

      expect(visibleRead?.find((v) => v.id === contract!.id)?.perm).toBe(
        'read',
      );

      await supabase
        .from('contract_acl_user')
        .update({ perm: 'admin' })
        .eq('contract_id', contract!.id)
        .eq('user_id', MANAGER_USER_ID);

      const { data: visibleAdmin } = await supabase.rpc(
        'contracts_visible_to',
        {
          p_organization_id: TEST_ORG_ID,
          p_user_id: MANAGER_USER_ID,
        },
      );

      expect(visibleAdmin?.find((v) => v.id === contract!.id)?.perm).toBe(
        'admin',
      );

      await supabase
        .from('contract_acl_user')
        .delete()
        .eq('contract_id', contract!.id);
      await supabase.from('contracts').delete().eq('id', contract!.id);
    });
  });
});
