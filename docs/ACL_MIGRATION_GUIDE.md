# ACL System Migration Guide

## Overview

The new ACL (Access Control List) system replaces the previous role-based access control with a more granular, flexible permission system. The migration introduces database-level permission checking using PostgreSQL functions and ltree-based folder hierarchies.

## Key Changes

### Database Schema

The migration `20251022153430_folders_schema_3.sql` introduces:

1. **Permission Level Enum**

   ```sql
   create type "public"."permission_level" as enum ('read', 'write', 'admin');
   ```

2. **ACL Tables**
   - `contract_acl_user`: Direct user permissions on contracts
   - `contract_acl_group`: Group permissions on contracts
   - `folder_acl_user`: User permissions on folders
   - `folder_acl_group`: Group permissions on folders
   - `groups`: User groups within organizations
   - `group_members`: User membership in groups

3. **Core Functions**
   - `contracts_visible_to(p_organization_id uuid, p_user_id uuid)`: Returns contracts visible to a user with their permission level
   - `folders_visible_to(p_organization_id uuid, p_user_id uuid)`: Returns folders visible to a user
   - `is_org_admin(p_org uuid, p_user uuid)`: Checks if user is organization admin
   - `is_folder_admin(p_org uuid, p_user uuid)`: Checks if user is folder admin

4. **Organization ID Added**
   - All contracts now have `organization_id` for multi-tenant isolation
   - All ACL tables include `organization_id` for data partitioning

## Permission Hierarchy

The `contracts_visible_to` function determines visibility through multiple sources (in order of evaluation):

1. **Organization-wide Admin Access** (roles 12/1/2)
   - Supervisors and admins get admin permission on all org contracts

2. **Direct User Permissions**
   - Explicit grants via `contract_acl_user`
   - Takes the maximum permission if multiple grants exist

3. **Group Permissions**
   - Permissions via `contract_acl_group` for groups the user belongs to
   - User must be member of group via `group_members`

4. **Implicit Owner Permissions**
   - Users automatically get admin permission on contracts where `contracts.user_id = user_id`

5. **Folder Inheritance**
   - Permissions inherited from folder ACLs using ltree path matching
   - If contract is in folder, user's folder permissions apply
   - Permissions propagate down the folder hierarchy

The final permission is the **maximum** across all sources.

## New Functions

### Contract Fetching with ACL

#### `fetchContractsByACL()`

**Location**: `/data/superuser/contracts-acl.ts`

Replacement for `fetchContractsByUserRoles()` that uses the new ACL system.

**Key Differences**:

- Uses `contracts_visible_to()` RPC to get accessible contract IDs
- No need to pass `orgUserIds` - handled by database
- More efficient - single RPC call vs multiple queries
- Supports all same filtering options

**Usage**:

```typescript
import { fetchContractsByACL } from '@/data/superuser/contracts-acl';

const contracts = await fetchContractsByACL({
  userMetadata,
  status: 'active',
  contractTypes: [1, 2],
  query: 'vendor name',
  // ... other filters
});
```

#### `fetchContractsByIdACL()`

Fetches specific contracts by ID, respecting ACL permissions.

**Usage**:

```typescript
import { fetchContractsByIdACL } from '@/data/superuser/contracts-acl';

const contracts = await fetchContractsByIdACL({
  ids: [123, 456],
  userMetadata,
});
```

#### `fetchContractDocumentsByIdACL()`

Fetches contract documents with ACL checks.

**Usage**:

```typescript
import { fetchContractDocumentsByIdACL } from '@/data/superuser/contracts-acl';

const documents = await fetchContractDocumentsByIdACL({
  id: 123,
  userMetadata,
});
```

#### `checkContractAccess()`

Utility function to check if user has specific permission level on a contract.

**Usage**:

```typescript
import { checkContractAccess } from '@/data/superuser/contracts-acl';

const canWrite = await checkContractAccess(
  contractId,
  userMetadata,
  'write', // required permission level
);

if (!canWrite) {
  throw new Error('Insufficient permissions');
}
```

## Updated Utility Functions

### `data/utils.ts` Changes

The `extendSupabaseQueryByUserRole()` function has been updated to:

1. **Accept organization_id parameter**
   - Now properly passes both `p_organization_id` and `p_user_id` to RPC functions
2. **Simplified logic for admins/supervisors**
   - No longer needs to aggregate visibility across all org users
   - The database function handles this via `is_org_admin()`

3. **Auto-fetch organization_id**
   - Helper function `getOrganizationIdFromUser()` retrieves org ID when not available

**Before**:

```typescript
await extendSupabaseQueryByUserRole(
  supabase,
  query,
  userId,
  userRole,
  orgUserIds, // needed to pass all org users
);
```

**After** (no breaking changes to signature):

```typescript
await extendSupabaseQueryByUserRole(
  supabase,
  query,
  userId,
  userRole,
  orgUserIds, // still accepted but not used for ACL logic
);
```

## Migration Path

### Option 1: Gradual Migration (Recommended)

1. **Keep existing code working**
   - `fetchContractsByUserRoles()` still works via updated `extendSupabaseQueryByUserRole()`
   - No immediate breaking changes

2. **Migrate incrementally**
   - Update new features to use `fetchContractsByACL()`
   - Refactor existing features during normal development
   - Test thoroughly in each module

3. **Eventually deprecate**
   - Once all code uses new ACL functions
   - Remove old functions and simplify codebase

### Option 2: Direct Replacement

To replace existing usage in `actions.ts`:

**Before**:

```typescript
const contracts = await fetchContractsByUserRoles({
  ...fetchContractParams,
  userMetadata,
});
```

**After**:

```typescript
const contracts = await fetchContractsByACL({
  ...fetchContractParams,
  userMetadata,
});
```

## Performance Considerations

### Advantages

1. **Single Database Call**
   - One RPC to get all visible contracts
   - No N+1 query problems for admins checking multiple users

2. **Database-Level Optimization**
   - PostgreSQL can optimize ltree path matching
   - Proper indexes on organization_id, user_id, group_id

3. **Reduced Network Traffic**
   - Less data transferred between app and database
   - Permission logic runs in database

### Indexes

The migration creates these indexes for performance:

```sql
CREATE INDEX idx_contracts_org ON contracts (organization_id);
CREATE INDEX idx_caclu_org_user_contract ON contract_acl_user (organization_id, user_id, contract_id);
CREATE INDEX idx_caclg_org_group_contract ON contract_acl_group (organization_id, group_id, contract_id);
CREATE INDEX idx_gm_org_user ON group_members (organization_id, user_id);
```

## Security Implications

### Improved Security

1. **Multi-tenant Isolation**
   - Organization ID required in all ACL checks
   - Prevents cross-org data leakage

2. **Fine-grained Control**
   - Can grant read/write/admin at user or group level
   - Folder-based permissions for organizational hierarchy

3. **Audit Trail**
   - All permission grants stored in ACL tables
   - Can track who has access to what

### RLS Policies

The migration includes Row Level Security policies:

- Users can only create folder_contracts in their organization
- Supervisors can file/unfile contracts (bypass folder permissions)
- Folder admins can create/update/delete subfolders
- Supervisors can manage all folders

## Examples

### Granting Contract Access

```typescript
import {
  addUserToContract,
  addGroupToContract,
} from '@/data/superuser/contracts';

// Grant read access to a user
await addUserToContract(contractId, userId, 'read');

// Grant write access to a group
await addGroupToContract(contractId, groupId, 'write');
```

### Checking Access

```typescript
import { checkContractAccess } from '@/data/superuser/contracts-acl';

// Check if user can edit contract
const canEdit = await checkContractAccess(contractId, userMetadata, 'write');
```

### Using in Server Actions

```typescript
// app/lib/contracts/actions.ts
import { fetchContractsByACL } from '@/data/superuser/contracts-acl';

export async function fetchContracts(
  fetchContractParams: FetchContractsParams,
): Promise<any> {
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    throw new AuthenticationError('User metadata not found');
  }

  const contracts = await fetchContractsByACL({
    ...fetchContractParams,
    userMetadata,
  });

  const contractsInUSD = await Promise.all(
    contracts.map(async (contract) => {
      if (!contract) return contract;
      const productsInUSD = await convertAllProductsToUSD(contract);
      return {
        ...(contract as Record<string, any>),
        vendor_products_details: productsInUSD,
      };
    }),
  );

  return contractsInUSD;
}
```

## Testing

### Unit Tests

Test the ACL functions with various permission scenarios:

```typescript
describe('fetchContractsByACL', () => {
  it('should return only contracts user has access to', async () => {
    // Test implementation
  });

  it('should respect permission levels', async () => {
    // Test implementation
  });

  it('should inherit folder permissions', async () => {
    // Test implementation
  });
});
```

### Integration Tests

Test end-to-end flows with real database:

1. Create users, groups, contracts
2. Grant various permissions
3. Verify correct contracts returned
4. Test permission hierarchy

## Troubleshooting

### No contracts returned

**Symptom**: User sees no contracts even though they should

**Possible Causes**:

1. Missing `organization_id` in contracts table
2. No ACL grants or role assignments
3. RPC function not finding user's organization

**Debug**:

```sql
-- Check user's organization
SELECT organization_id FROM users WHERE id = 'user-uuid';

-- Check visible contracts
SELECT * FROM contracts_visible_to('org-uuid', 'user-uuid');

-- Check ACL grants
SELECT * FROM contract_acl_user WHERE user_id = 'user-uuid';
SELECT * FROM contract_acl_group cg
JOIN group_members gm ON gm.group_id = cg.group_id
WHERE gm.user_id = 'user-uuid';
```

### Performance issues

**Symptom**: Slow contract fetching

**Possible Causes**:

1. Missing indexes
2. Large number of contracts
3. Complex folder hierarchies

**Solutions**:

1. Verify indexes exist (see migration)
2. Consider caching visible contract IDs
3. Profile the `contracts_visible_to` function
4. Add pagination if returning many contracts

## Future Enhancements

Potential improvements to the ACL system:

1. **Permission Caching**
   - Cache visible contract IDs per user
   - Invalidate on permission changes

2. **Audit Logging**
   - Log all ACL grants/revokes
   - Track who accessed what contracts

3. **Permission Templates**
   - Pre-defined permission sets
   - Easy role assignment

4. **Bulk Operations**
   - Grant permissions to multiple users/groups at once
   - Bulk permission revocation

## References

- Migration: `/supabase/migrations/20251022153430_folders_schema_3.sql`
- New Functions: `/data/superuser/contracts-acl.ts`
- Updated Utils: `/data/utils.ts`
- Database Types: `/database.types.ts` (regenerate after migration)
