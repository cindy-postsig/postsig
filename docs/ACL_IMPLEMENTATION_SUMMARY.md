# ACL System Implementation Summary

## What Was Done

### 1. Created New ACL-Based Contract Functions

**File**: `/data/superuser/contracts-acl.ts`

This new module provides ACL-aware functions that leverage the database-level permission system:

#### Main Functions

1. **`fetchContractsByACL()`**
   - Direct replacement for `fetchContractsByUserRoles()`
   - Uses `contracts_visible_to()` database function
   - More efficient single RPC call
   - Supports all existing filter parameters

2. **`fetchContractsByIdACL()`**
   - ACL-aware version of `fetchContractsByIdByUserRoles()`
   - Filters requested IDs to only accessible ones
   - Returns null if user has no access to any requested contracts

3. **`fetchContractDocumentsByIdACL()`**
   - ACL-aware document fetching
   - Checks access before returning documents

4. **`checkContractAccess()`**
   - Utility to check specific permission level
   - Useful for authorization checks before operations
   - Returns boolean for permission check

#### Helper Functions

- **`getContractsVisibleToUser()`**
  - Internal function that calls `contracts_visible_to()` RPC
  - Handles PostSig internal roles specially
  - Returns array of contract IDs user can access

### 2. Fixed Existing ACL Implementation

**File**: `/data/utils.ts`

#### Critical Bug Fix

The existing `extendQueryByUserRoleACL()` was missing the `p_organization_id` parameter when calling the RPC function. The database function signature is:

```sql
contracts_visible_to(p_organization_id uuid, p_user_id uuid)
```

But the code was only passing:

```typescript
{
  p_user_id: userId;
}
```

#### Changes Made

1. **Added `organizationId` parameter** to `extendQueryByUserRoleACL()`
2. **Updated RPC calls** to include both parameters:
   ```typescript
   {
     p_organization_id: organizationId,
     p_user_id: userId
   }
   ```
3. **Simplified admin/supervisor logic**
   - No longer aggregates visibility across all org users
   - Database function handles this via `is_org_supervisor_or_admin()`
4. **Added helper function** `getOrganizationIdFromUser()` to fetch org ID

### 3. Exported Helper Functions

**File**: `/data/superuser/contracts.ts`

Made these functions exportable for reuse:

- `adaptContractsWithCurrentVendorInfo()` - Adapts vendor information
- `resolveAndCleanIctProviderStatus()` - Resolves ICT provider status

### 4. Created Comprehensive Documentation

**Files**:

- `/docs/ACL_MIGRATION_GUIDE.md` - Complete migration guide
- `/docs/ACL_IMPLEMENTATION_SUMMARY.md` - This file

## How the New System Works

### Permission Resolution Flow

```text
User requests contracts
        ↓
Get userMetadata (orgId, userId, role)
        ↓
Call contracts_visible_to(orgId, userId)
        ↓
Database evaluates:
  1. Is user org admin/supervisor? → All contracts
  2. Direct user ACL grants? → Add those contracts
  3. User in groups? → Add group ACL contracts
  4. Is user contract owner? → Add owned contracts
  5. Folder ACLs? → Add inherited contracts
        ↓
Return contract IDs + permission levels
        ↓
Filter contracts query by visible IDs
        ↓
Apply additional filters (status, type, etc.)
        ↓
Return filtered contracts
```

### Key Advantages

1. **Single Database Call**
   - One RPC determines all accessible contracts
   - No N+1 query issues

2. **Database-Level Logic**
   - Permission logic runs in PostgreSQL
   - Can leverage database optimizations
   - Proper use of indexes

3. **Multi-Source Permissions**
   - Direct user grants
   - Group memberships
   - Folder inheritance
   - Implicit ownership
   - Takes maximum permission

4. **Organization Isolation**
   - All queries scoped to organization
   - Prevents cross-tenant data leakage

## Recommended Migration Strategy

### Phase 1: Validation (Current)

1. **Keep both implementations**
   - Old: `fetchContractsByUserRoles()`
   - New: `fetchContractsByACL()`

2. **Test new functions thoroughly**
   - Unit tests for ACL logic
   - Integration tests with real data
   - Performance benchmarking

3. **Verify backward compatibility**
   - Existing code still works via fixed `extendSupabaseQueryByUserRole()`

### Phase 2: Gradual Adoption (Recommended Next Steps)

1. **Update high-traffic endpoints first**
   - `fetchContractsBase()` in `actions.ts`
   - Main contract listing pages
   - Dashboard queries

2. **Example change in `actions.ts`**:

   **Current**:

   ```typescript
   const contracts = await fetchContractsByUserRoles({
     userMetadata,
   });
   ```

   **Update to**:

   ```typescript
   const contracts = await fetchContractsByACL({
     userMetadata,
   });
   ```

3. **Monitor and compare**
   - Log query performance
   - Compare results between old/new
   - Validate permission accuracy

### Phase 3: Full Migration

1. **Update all contract fetching**
   - Replace all `fetchContractsByUserRoles()` calls
   - Replace `fetchContractsByIdByUserRoles()` calls
   - Replace `fetchContractDocumentsByIdByUserRoles()` calls

2. **Remove old implementations**
   - Once all code migrated
   - Delete deprecated functions
   - Clean up imports

3. **Update caching**
   - May need to adjust cache keys
   - Consider caching visible contract IDs

## Testing Recommendations

### 1. Permission Scenarios to Test

```typescript
// Test cases
describe('ACL System', () => {
  it('should allow org admin to see all contracts', async () => {});
  it('should show only user-owned contracts for regular user', async () => {});
  it('should include group-accessible contracts', async () => {});
  it('should inherit folder permissions', async () => {});
  it('should respect read/write/admin levels', async () => {});
  it('should isolate organizations', async () => {});
});
```

### 2. Performance Testing

```typescript
// Benchmark
const start = Date.now();
const oldResult = await fetchContractsByUserRoles({...});
const oldTime = Date.now() - start;

const start2 = Date.now();
const newResult = await fetchContractsByACL({...});
const newTime = Date.now() - start2;

console.log(`Old: ${oldTime}ms, New: ${newTime}ms`);
console.log(`Results match: ${isEqual(oldResult, newResult)}`);
```

### 3. Data Validation

```sql
-- Verify migration results
-- Check all contracts have organization_id
SELECT COUNT(*)
FROM contracts
WHERE organization_id IS NULL;
-- Should be 0

-- Verify ACL coverage
SELECT c.id, c.vendor_id, cv.id as visible
FROM contracts c
LEFT JOIN contracts_visible_to('org-id', 'user-id') cv ON cv.id = c.id
WHERE c.organization_id = 'org-id';
```

## Immediate Next Steps

### For `actions.ts`

1. **Import the new function**:

   ```typescript
   import { fetchContractsByACL } from '@/data/superuser/contracts-acl';
   ```

2. **Update `fetchContractsBase()`**:

   ```typescript
   const contracts = await fetchContractsByACL({
     userMetadata,
   });
   ```

3. **Test thoroughly**:
   - Run existing tests
   - Verify contract visibility
   - Check performance

### For Database

1. **Regenerate types**:

   ```bash
   npx supabase gen types typescript --local > database.types.ts
   ```

2. **Run migration**:

   ```bash
   npx supabase migration up
   ```

3. **Verify RPC function**:
   ```sql
   -- Test in Supabase SQL editor
   SELECT * FROM contracts_visible_to(
     'your-org-id'::uuid,
     'your-user-id'::uuid
   );
   ```

## Potential Issues and Solutions

### Issue 1: Missing organization_id

**Symptom**: Contracts not showing up

**Solution**:

```sql
-- Backfill organization_id if needed
UPDATE contracts c
SET organization_id = u.organization_id
FROM users u
WHERE c.user_id = u.id
AND c.organization_id IS NULL;
```

### Issue 2: Type errors with RPC

**Symptom**: TypeScript errors on RPC calls

**Solution**: Already handled with `as any` type assertions until database types are regenerated.

### Issue 3: Performance regression

**Symptom**: Slower queries after migration

**Solution**:

1. Check indexes exist (migration creates them)
2. Analyze query plans
3. Consider caching visible contract IDs
4. Profile the RPC function

## Benefits Summary

### Developer Experience

- ✅ Cleaner, more maintainable code
- ✅ Single source of truth for permissions
- ✅ Easier to reason about access control
- ✅ Better type safety with permission levels

### Performance

- ✅ Fewer database round trips
- ✅ Better query optimization
- ✅ Reduced application-level filtering
- ✅ Proper database indexing

### Security

- ✅ Multi-tenant isolation
- ✅ Fine-grained permissions
- ✅ Audit-ready ACL tables
- ✅ Database-enforced access control

### Flexibility

- ✅ User-level permissions
- ✅ Group-based access
- ✅ Folder hierarchy inheritance
- ✅ Multiple permission levels

## Questions to Consider

1. **Caching Strategy**
   - Should we cache visible contract IDs?
   - Cache invalidation on permission changes?
   - Per-user or per-org caching?

2. **Permission Management UI**
   - Do we need UI to manage ACLs?
   - Bulk permission assignment?
   - Permission reporting/auditing?

3. **Backward Compatibility**
   - How long to maintain old functions?
   - Deprecation timeline?
   - Migration path for API consumers?

4. **Monitoring**
   - Log ACL performance?
   - Track permission denials?
   - Alert on ACL misconfigurations?

## Conclusion

The new ACL system provides a robust, scalable foundation for contract permissions. The implementation:

- ✅ Properly integrates with database schema
- ✅ Fixes critical bugs in existing implementation
- ✅ Maintains backward compatibility
- ✅ Provides clear migration path
- ✅ Includes comprehensive documentation

**Recommended Action**: Test the new functions in development, then gradually migrate production code starting with `fetchContractsBase()` in `actions.ts`.
