# ACL System Quick Reference

## TL;DR

The new ACL system uses database-level permission checking via `contracts_visible_to(org_id, user_id)` function instead of application-level role filtering.

## Quick Start

### Replace Contract Fetching

**Old Way**:

```typescript
import { fetchContractsByUserRoles } from '@/data/superuser/contracts';

const contracts = await fetchContractsByUserRoles({
  userMetadata,
  status: 'active',
});
```

**New Way**:

```typescript
import { fetchContractsByACL } from '@/data/superuser/contracts-acl';

const contracts = await fetchContractsByACL({
  userMetadata,
  status: 'active',
});
```

### Check Contract Access

```typescript
import { checkContractAccess } from '@/data/superuser/contracts-acl';

const canEdit = await checkContractAccess(
  contractId,
  userMetadata,
  'write', // or 'read', 'admin'
);
```

## Permission Levels

```typescript
type PermissionLevel = 'read' | 'write' | 'admin';
```

- `read`: Can view contract
- `write`: Can edit contract
- `admin`: Full control (edit, delete, share)

## How Access is Determined

User gets access to a contract if ANY of these are true:

1. **Org Admin/Supervisor** (roles 12, 1, 2) → Admin on all contracts
2. **Explicit Grant** via `contract_acl_user` → Specified permission
3. **Group Member** via `contract_acl_group` → Specified permission
4. **Contract Owner** (`contracts.user_id`) → Admin permission
5. **Folder Inheritance** via folder ACLs → Inherited permission

Final permission = **Maximum** across all sources.

## Database Function

```sql
-- Returns: TABLE(id bigint, perm permission_level)
SELECT * FROM contracts_visible_to(
  'org-uuid'::uuid,  -- p_organization_id
  'user-uuid'::uuid  -- p_user_id
);
```

## Common Patterns

### Fetch All Accessible Contracts

```typescript
const contracts = await fetchContractsByACL({
  userMetadata,
});
```

### Fetch with Filters

```typescript
const activeContracts = await fetchContractsByACL({
  userMetadata,
  status: 'active',
  contractTypes: [1, 2, 3],
  hideFailed: true,
});
```

### Fetch Specific Contracts

```typescript
const contracts = await fetchContractsByIdACL({
  ids: [123, 456, 789],
  userMetadata,
});
// Only returns contracts user has access to
```

### Check Permission Before Action

```typescript
const canDelete = await checkContractAccess(contractId, userMetadata, 'admin');

if (!canDelete) {
  throw new Error('Insufficient permissions');
}

await deleteContract(contractId);
```

## Granting Access

### Grant to User

```typescript
import { addUserToContract } from '@/data/superuser/contracts';

await addUserToContract(
  contractId,
  userId,
  'read', // permission level
);
```

### Grant to Group

```typescript
import { addGroupToContract } from '@/data/superuser/contracts';

await addGroupToContract(
  contractId,
  groupId,
  'write', // permission level
);
```

### Revoke Access

```typescript
import {
  removeUserFromContract,
  removeGroupFromContract,
} from '@/data/superuser/contracts';

await removeUserFromContract(contractId, userId);
await removeGroupFromContract(contractId, groupId);
```

## Debugging

### Check What User Can See

```sql
-- In Supabase SQL editor
SELECT c.id, c.vendor_id, v.perm
FROM contracts c
JOIN contracts_visible_to('org-id', 'user-id') v ON v.id = c.id
ORDER BY c.updated_at DESC;
```

### Check Why User Has Access

```sql
-- Direct user grant?
SELECT * FROM contract_acl_user
WHERE contract_id = 123 AND user_id = 'user-id';

-- Via group?
SELECT cg.*, gm.user_id
FROM contract_acl_group cg
JOIN group_members gm ON gm.group_id = cg.group_id
WHERE cg.contract_id = 123 AND gm.user_id = 'user-id';

-- Is owner?
SELECT * FROM contracts
WHERE id = 123 AND user_id = 'user-id';

-- Via folder?
SELECT fc.folder_id, fau.perm
FROM folder_contracts fc
JOIN folder_acl_user fau ON fau.folder_id = fc.folder_id
WHERE fc.contract_id = 123 AND fau.user_id = 'user-id';
```

### Performance Check

```sql
-- Explain analyze the visibility function
EXPLAIN ANALYZE
SELECT * FROM contracts_visible_to('org-id', 'user-id');
```

## Migration Checklist

- [ ] Run migration `20251022153430_folders_schema_3.sql`
- [ ] Regenerate database types: `npx supabase gen types typescript`
- [ ] Import new functions in your code
- [ ] Replace `fetchContractsByUserRoles` with `fetchContractsByACL`
- [ ] Replace `fetchContractsByIdByUserRoles` with `fetchContractsByIdACL`
- [ ] Add permission checks before sensitive operations
- [ ] Test with different user roles
- [ ] Verify organization isolation
- [ ] Check performance benchmarks

## Common Issues

### No contracts returned

✅ Check user has organization_id set
✅ Verify contracts have organization_id populated
✅ Check user has at least one ACL grant or appropriate role

### Wrong permission level

✅ Remember: system takes MAXIMUM permission across sources
✅ Check all ACL grants (user + groups)
✅ Check if user is owner or admin

### Type errors

✅ Use `as any` on RPC calls until types regenerated
✅ Regenerate types after migration

### Performance issues

✅ Verify indexes exist (created by migration)
✅ Consider caching visible contract IDs
✅ Profile the RPC function with EXPLAIN ANALYZE

## Files Reference

| File                                                      | Purpose                  |
| --------------------------------------------------------- | ------------------------ |
| `data/superuser/contracts-acl.ts`                         | New ACL-based functions  |
| `data/utils.ts`                                           | Updated helper functions |
| `supabase/migrations/20251022153430_folders_schema_3.sql` | ACL schema               |
| `docs/ACL_MIGRATION_GUIDE.md`                             | Complete guide           |
| `docs/ACL_IMPLEMENTATION_SUMMARY.md`                      | Implementation details   |

## Support

For detailed information, see:

- [Full Migration Guide](./ACL_MIGRATION_GUIDE.md)
- [Implementation Summary](./ACL_IMPLEMENTATION_SUMMARY.md)
