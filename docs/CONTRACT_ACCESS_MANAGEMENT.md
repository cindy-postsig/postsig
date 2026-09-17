# Contract Access Management

Complete guide to managing and querying contract access permissions in the PostSig platform.

## Table of Contents

- [Overview](#overview)
- [Permission Levels](#permission-levels)
- [Core Functions](#core-functions)
  - [contracts_visible_to](#contracts_visible_to)
  - [users_who_can_see_contracts](#users_who_can_see_contracts)
  - [checkContractAccess](#checkcontractaccess)
  - [getContractACL](#getcontractacl)
- [Access Rules](#access-rules)
- [TypeScript API](#typescript-api)
- [SQL Examples](#sql-examples)
- [Common Use Cases](#common-use-cases)
- [Security Considerations](#security-considerations)
- [Troubleshooting](#troubleshooting)

## Overview

The contract access management system provides fine-grained control over who can view, edit, and manage contracts. Access can be granted through multiple channels:

1. **Direct user grants** - Explicit permissions to individual users
2. **Group memberships** - Permissions inherited through group membership
3. **Ownership** - Contract creators automatically get admin access
4. **Folder inheritance** - Permissions inherited from folder ACLs
5. **Organization roles** - Admins and supervisors automatically get admin access

The system uses a **maximum permission** model: if a user has access through multiple channels, they receive the highest permission level across all sources.

## Permission Levels

```typescript
type PermissionLevel = 'read' | 'write' | 'admin';
```

| Level     | Capabilities                                                                      |
| --------- | --------------------------------------------------------------------------------- |
| **read**  | View contract details, documents, and metadata                                    |
| **write** | Everything in `read`, plus edit contract fields and upload documents              |
| **admin** | Everything in `write`, plus delete contract, manage sharing, and change ownership |

### Permission Hierarchy

```
admin > write > read
```

When a user has multiple permission sources, the system grants the highest level.

## Core Functions

### contracts_visible_to

**Purpose**: Find all contracts a specific user can access.

**Function Signature**:

```sql
contracts_visible_to(
  p_organization_id uuid,
  p_user_id uuid
) RETURNS TABLE(id bigint, perm permission_level)
```

**Returns**: List of contract IDs and permission levels for the specified user.

#### SQL Usage

```sql
-- Get all contracts visible to a user
SELECT * FROM contracts_visible_to(
  '550e8400-e29b-41d4-a716-446655440000'::uuid,  -- organization_id
  '123e4567-e89b-12d3-a456-426614174000'::uuid   -- user_id
);

-- Result:
--   id    |  perm
-- --------|-------
--   1     | admin
--   5     | write
--   12    | read
```

#### TypeScript Usage

```typescript
import { fetchContractsByACL } from '@/data/superuser/contracts-acl';

// Fetch all contracts user can access
const contracts = await fetchContractsByACL({
  userMetadata,
  status: 'active',
  contractTypes: [1, 2, 3],
});

// With filters
const activeContracts = await fetchContractsByACL({
  userMetadata,
  status: 'active',
  hideFailed: true,
  limit: 50,
});
```

#### How It Works

The function aggregates permissions from five sources:

1. **Direct ACL** (`contract_acl_user` table)
2. **Group ACL** (`contract_acl_group` + `group_members` tables)
3. **Ownership** (contracts where `user_id` matches)
4. **Folder Inheritance** (via folder ACL tables)
5. **Role Override** (org admins/supervisors get admin on all contracts)

### users_who_can_see_contracts

**Purpose**: Find all users who can access multiple contracts in a single query (bulk operation). This is the primary function for retrieving contract access lists, optimized for both single and batch operations.

**Function Signature**:

```sql
users_who_can_see_contracts(
  p_contract_ids bigint[],
  p_organization_id uuid
) RETURNS TABLE(
  contract_id bigint,
  user_id uuid,
  email text,
  name text,
  organization_id uuid,
  perm permission_level,
  signed_up boolean,
  permission_sources text[]
)
```

**Returns**: List of users with access for each contract, including:

- **contract_id**: The contract the user has access to
- **user_id**: User's UUID
- **email**: User's email address
- **name**: User's display name
- **organization_id**: User's organization
- **perm**: Maximum permission level (`read`, `write`, or `admin`)
- **signed_up**: Whether user has completed registration (false for pending invites)
- **permission_sources**: Array of sources granting access (see [Permission Sources](#permission-sources))

**Security**: Requires `SECURITY DEFINER` to bypass RLS. Only callable by authenticated users (application validates admin access).

#### Permission Sources

The `permission_sources` array indicates how a user gained access to a contract:

| Source                     | Description                                               |
| -------------------------- | --------------------------------------------------------- |
| `direct_acl`               | User was explicitly granted access via contract ACL       |
| `group_membership`         | User has access through a group membership                |
| `contract_owner`           | User is the contract uploader/creator                     |
| `folder_inheritance`       | User has direct folder ACL that applies to this contract  |
| `folder_group_inheritance` | User's group has folder ACL that applies to this contract |
| `org_admin`                | User is an organization admin/supervisor                  |

**Note**: A user may have multiple sources. The function returns the **maximum permission** across all sources, along with **all sources** that grant access.

#### SQL Usage

```sql
-- Get all users who can see multiple contracts
SELECT * FROM users_who_can_see_contracts(
  ARRAY[123, 456, 789]::bigint[],                    -- contract_ids array
  '550e8400-e29b-41d4-a716-446655440000'::uuid      -- organization_id
);

-- Result:
--   contract_id | user_id      | email             | name    | organization_id | perm  | signed_up | permission_sources
-- --------------|--------------|-------------------|---------|-----------------|-------|-----------|-----------------------------------
--   123         | 123e4567-... | alice@company.com | Alice   | 550e8400-...   | admin | true      | {contract_owner,org_admin}
--   123         | 223e4567-... | bob@company.com   | Bob     | 550e8400-...   | write | true      | {direct_acl}
--   456         | 123e4567-... | alice@company.com | Alice   | 550e8400-...   | admin | true      | {org_admin}
--   789         | 323e4567-... | carol@company.com | Carol   | 550e8400-...   | read  | false     | {direct_acl}
```

#### Filtering by Permission Source

```sql
-- Get only users with DIRECT access (excluding system-level access)
SELECT *
FROM users_who_can_see_contracts(
  ARRAY[123]::bigint[],
  '550e8400-e29b-41d4-a716-446655440000'::uuid
)
WHERE 'direct_acl' = ANY(permission_sources)
   OR 'contract_owner' = ANY(permission_sources);

-- Get only organization admins
SELECT *
FROM users_who_can_see_contracts(
  ARRAY[123, 456]::bigint[],
  '550e8400-e29b-41d4-a716-446655440000'::uuid
)
WHERE 'org_admin' = ANY(permission_sources);

-- Get users with folder-inherited access
SELECT *
FROM users_who_can_see_contracts(
  ARRAY[123]::bigint[],
  '550e8400-e29b-41d4-a716-446655440000'::uuid
)
WHERE 'folder_inheritance' = ANY(permission_sources)
   OR 'folder_group_inheritance' = ANY(permission_sources);

-- Get pending user invitations
SELECT *
FROM users_who_can_see_contracts(
  ARRAY[123]::bigint[],
  '550e8400-e29b-41d4-a716-446655440000'::uuid
)
WHERE signed_up = false;
```

#### Grouping Results by Contract

```sql
-- Group users by contract for easier processing
SELECT
  contract_id,
  json_agg(
    json_build_object(
      'userId', user_id,
      'name', name,
      'email', email,
      'perm', perm,
      'signedUp', signed_up,
      'permissionSources', permission_sources
    )
  ) as users
FROM users_who_can_see_contracts(
  ARRAY[123, 456, 789]::bigint[],
  '550e8400-e29b-41d4-a716-446655440000'::uuid
)
GROUP BY contract_id;

-- Result:
--   contract_id | users
-- --------------|------------------------------------------------------------------------------
--   123         | [{"userId": "...", "name": "Alice", "email": "alice@...",
--              |   "perm": "admin", "signedUp": true,
--              |   "permissionSources": ["contract_owner", "org_admin"]}, ...]
--   456         | [{"userId": "...", "name": "Alice", "email": "alice@...",
--              |   "perm": "admin", "signedUp": true, "permissionSources": ["org_admin"]}, ...]
--   789         | [{"userId": "...", "name": "Carol", "email": "carol@...",
--              |   "perm": "read", "signedUp": false, "permissionSources": ["direct_acl"]}, ...]
```

#### TypeScript Usage

```typescript
import { getUsersWhoCanSeeContracts } from '@/data/superuser/contracts';

// Get all users who can see multiple contracts
const viewers = await getUsersWhoCanSeeContracts(
  [123, 456, 789],
  organizationId,
);

// Result structure:
// [
//   {
//     contractId: 123,
//     userId: '123e4567-...',
//     email: 'alice@company.com',
//     name: 'Alice',
//     organizationId: '550e8400-...',
//     perm: 'admin',
//     signedUp: true,
//     permissionSources: ['contract_owner', 'org_admin']
//   },
//   {
//     contractId: 123,
//     userId: '223e4567-...',
//     email: 'bob@company.com',
//     name: 'Bob',
//     organizationId: '550e8400-...',
//     perm: 'write',
//     signedUp: true,
//     permissionSources: ['direct_acl']
//   },
//   ...
// ]

// Group by contract ID for easier processing
const usersByContract = viewers.reduce(
  (acc, viewer) => {
    if (!acc[viewer.contractId]) {
      acc[viewer.contractId] = [];
    }
    acc[viewer.contractId].push({
      userId: viewer.userId,
      name: viewer.name,
      email: viewer.email,
      organizationId: viewer.organizationId,
      perm: viewer.perm,
      signedUp: viewer.signedUp,
      permissionSources: viewer.permissionSources,
    });
    return acc;
  },
  {} as Record<
    number,
    Array<{
      userId: string;
      name: string;
      email: string;
      organizationId: string;
      perm: PermissionLevel;
      signedUp: boolean;
      permissionSources: string[];
    }>
  >,
);

// Filter to show only direct access (no system-level access)
const directAccessUsers = viewers.filter(
  (viewer) =>
    viewer.permissionSources.includes('direct_acl') ||
    viewer.permissionSources.includes('contract_owner'),
);

// Find pending invitations
const pendingInvites = viewers.filter((viewer) => !viewer.signedUp);

// Separate system admins from regular users
const systemAdmins = viewers.filter((viewer) =>
  viewer.permissionSources.includes('org_admin'),
);
const regularUsers = viewers.filter(
  (viewer) =>
    !viewer.permissionSources.includes('org_admin') ||
    viewer.permissionSources.includes('direct_acl') ||
    viewer.permissionSources.includes('contract_owner'),
);
```

#### When to Use

- **Sharing UI**: Display access lists for single or multiple contracts
- **Notifications**: Get all users to notify about contract changes
- **Access Audit**: Review permissions across contracts efficiently
- **Performance Optimization**: Single query for both single and bulk operations

#### Performance Benefits

This function is optimized for bulk operations:

- **Single Query**: One database call instead of N calls for N contracts
- **Efficient Aggregation**: PostgreSQL handles permission aggregation efficiently
- **Reduced Network Overhead**: Less round-trip time compared to multiple function calls

**Example**:

```typescript
// Efficient: Single database call for multiple contracts
import { getUsersWhoCanSeeContracts } from '@/data/superuser/contracts';

const viewers = await getUsersWhoCanSeeContracts(contractIds, orgId);

// Also works for single contracts (pass array with one ID)
const singleContractViewers = await getUsersWhoCanSeeContracts(
  [contractId],
  orgId,
);
```

#### Security Requirements

1. Verify user has admin permission on all requested contracts
2. Validate organization_id matches user's organization
3. Consider rate limiting for bulk operations

```typescript
async function canBulkViewContractAccess(
  contractIds: number[],
  userMetadata: UserMetadata,
): Promise<boolean> {
  if ([11, 12, 1, 2].includes(userMetadata.userRole)) {
    return true;
  }

  const accessChecks = await Promise.all(
    contractIds.map((id) => checkContractAccess(id, userMetadata, 'admin')),
  );

  return accessChecks.every((hasAccess) => hasAccess);
}
```

### checkContractAccess

**Purpose**: Verify if a user has a specific permission level on a contract.

**Function Signature**:

```typescript
checkContractAccess(
  contractId: number,
  userMetadata: UserMetadata,
  requiredPermission: PermissionLevel = 'read'
): Promise<boolean>
```

**Returns**: `true` if user has the required permission or higher, `false` otherwise.

#### Usage

```typescript
import { checkContractAccess } from '@/data/superuser/contracts-acl';

// Check before allowing deletion
const canDelete = await checkContractAccess(contractId, userMetadata, 'admin');

if (!canDelete) {
  throw new Error('Insufficient permissions to delete contract');
}

await deleteContract(contractId);

// Check for read access
const canView = await checkContractAccess(contractId, userMetadata, 'read');

// Check for write access
const canEdit = await checkContractAccess(contractId, userMetadata, 'write');
```

#### How It Works

1. Calls `contracts_visible_to` RPC function
2. Finds the specified contract in results
3. Compares user's permission against required permission
4. Returns `true` if user's permission >= required permission

Permission comparison uses this hierarchy:

```typescript
const permissionHierarchy = {
  read: 1,
  write: 2,
  admin: 3,
};
```

### getContractACL

**Purpose**: Get explicit ACL grants for a contract (does NOT include implicit access through ownership, roles, or folder inheritance).

**Function Signature**:

```typescript
getContractACL(
  contractId: number
): Promise<{
  users: Array<{
    id: string;
    name: string;
    email: string;
    perm: PermissionLevel;
    signedUp: boolean;
  }>;
  groups: Array<{
    id: number;
    name: string;
    perm: PermissionLevel;
  }>;
}>
```

#### Usage

```typescript
import { getContractACL } from '@/data/superuser/contracts';

const acl = await getContractACL(contractId);

// Display explicit grants
acl.users.forEach((user) => {
  console.log(`${user.name} (${user.email}): ${user.perm}`);
});

acl.groups.forEach((group) => {
  console.log(`${group.name} (group): ${group.perm}`);
});
```

#### Important Note

This function only returns **explicit ACL entries**. It does NOT include:

- Contract owner (implicit admin)
- Organization admins/supervisors (role-based admin)
- Users with folder-inherited permissions

For complete access list including all sources, use `users_who_can_see_contracts` instead.

## Access Rules

### Rule Priority

When a user has multiple permission sources, the system grants the **maximum** permission:

```typescript
// Example: User has access through multiple sources
const sources = [
  { source: 'direct_acl', perm: 'read' },
  { source: 'group_membership', perm: 'write' },
  { source: 'folder_inheritance', perm: 'read' },
];

// Final permission = max('read', 'write', 'read') = 'write'
```

### Organization Roles

Certain roles automatically get admin access to all contracts in their organization:

| Role ID | Role Name          | Access Level               |
| ------- | ------------------ | -------------------------- |
| 1       | PostSig Admin      | Admin on all contracts     |
| 2       | PostSig Supervisor | Admin on all contracts     |
| 11      | Client Admin       | Admin on all org contracts |
| 12      | Client Supervisor  | Admin on all org contracts |
| 14      | Client User        | No automatic access        |

### Folder Inheritance

Contracts inherit permissions from their folder:

```
Folder: "Legal Contracts"
  ├─ User Alice: write
  └─ Group Legal Team: read

Contract in folder → Alice gets 'write', Legal Team members get 'read'
```

Folder permissions use PostgreSQL's `ltree` for hierarchy:

```sql
-- Folder path uses ltree
-- Example: legal.vendor.active
-- Permissions on 'legal' apply to all subfolders
```

## TypeScript API

### Fetching Contracts

```typescript
// Fetch all accessible contracts
import { fetchContractsByACL } from '@/data/superuser/contracts-acl';

const contracts = await fetchContractsByACL({
  userMetadata,
  status?: 'active' | 'inactive',
  contractTypes?: number[],
  hideFailed?: boolean,
  limit?: number,
});
```

### Fetching Specific Contracts

```typescript
// Fetch specific contracts (only returns accessible ones)
import { fetchContractsByIdACL } from '@/data/superuser/contracts-acl';

const contracts = await fetchContractsByIdACL({
  ids: [123, 456, 789],
  userMetadata,
});
// If user can't access contract 456, only returns 123 and 789
```

### Checking Access

```typescript
// Check permission level
import { checkContractAccess } from '@/data/superuser/contracts-acl';

const hasAccess = await checkContractAccess(
  contractId,
  userMetadata,
  'read', // or 'write', 'admin'
);
```

### Managing Permissions

```typescript
// Grant access to user
import { addUserToContract } from '@/data/superuser/contracts';

await addUserToContract(contractId, userId, 'write');

// Grant access to group
import { addGroupToContract } from '@/data/superuser/contracts';

await addGroupToContract(contractId, groupId, 'read');

// Revoke access
import {
  removeUserFromContract,
  removeGroupFromContract,
} from '@/data/superuser/contracts';

await removeUserFromContract(contractId, userId);
await removeGroupFromContract(contractId, groupId);
```

### Getting Access Lists

```typescript
// Get explicit ACL entries only
import { getContractACL } from '@/data/superuser/contracts';

const explicitACL = await getContractACL(contractId);

// Get complete access list for contracts (works for single or multiple)
import { getUsersWhoCanSeeContracts } from '@/data/superuser/contracts';

// Single contract
const singleContractViewers = await getUsersWhoCanSeeContracts(
  [contractId],
  organizationId,
);
// Returns users with name, signedUp, permissionSources fields

// Multiple contracts (bulk operation)

const viewers = await getUsersWhoCanSeeContracts(
  [123, 456, 789],
  organizationId,
);

// Group results by contract ID with all new fields
const usersByContract = viewers.reduce(
  (acc, viewer) => {
    if (!acc[viewer.contractId]) {
      acc[viewer.contractId] = [];
    }
    acc[viewer.contractId].push({
      userId: viewer.userId,
      name: viewer.name,
      email: viewer.email,
      organizationId: viewer.organizationId,
      perm: viewer.perm,
      signedUp: viewer.signedUp,
      permissionSources: viewer.permissionSources,
    });
    return acc;
  },
  {} as Record<
    number,
    Array<{
      userId: string;
      name: string;
      email: string;
      organizationId: string;
      perm: PermissionLevel;
      signedUp: boolean;
      permissionSources: string[];
    }>
  >,
);

// Filter for sharing dialog: show only direct access
const directAccessUsers = viewers.filter((viewer) =>
  viewer.permissionSources.some(
    (source) => source === 'direct_acl' || source === 'contract_owner',
  ),
);

// Get system-level access separately
const systemAdmins = viewers.filter((viewer) =>
  viewer.permissionSources.includes('org_admin'),
);
```

## SQL Examples

### Find Contracts User Can Edit

```sql
SELECT c.id, c.vendor_id, v.name, v.perm
FROM contracts c
JOIN contracts_visible_to('org-id', 'user-id') v ON v.id = c.id
WHERE v.perm IN ('write', 'admin')
ORDER BY c.updated_at DESC;
```

### Find Contracts with Specific Access Level

```sql
-- Find contracts where user has exactly 'read' permission
SELECT c.id, c.vendor_id, v.perm
FROM contracts c
JOIN contracts_visible_to('org-id', 'user-id') v ON v.id = c.id
WHERE v.perm = 'read';
```

### Check If User Can Access Contract

```sql
-- Returns 1 if user can access, 0 if not
SELECT COUNT(*)
FROM contracts_visible_to('org-id', 'user-id') v
WHERE v.id = 123;
```

### Audit Who Has Admin Access

```sql
SELECT
  u.email,
  u.name,
  w.perm
FROM users_who_can_see_contracts(ARRAY[123]::bigint[], 'org-id') w
JOIN users u ON u.id = w.user_id
WHERE w.perm = 'admin';
```

### Bulk Audit: Find All Users with Admin Access Across Multiple Contracts

```sql
-- Get admin users for multiple contracts
SELECT
  w.contract_id,
  u.email,
  u.name,
  w.perm
FROM users_who_can_see_contracts(
  ARRAY[123, 456, 789]::bigint[],
  'org-id'
) w
JOIN users u ON u.id = w.user_id
WHERE w.perm = 'admin'
ORDER BY w.contract_id, u.email;
```

### Find Unique Users Across Multiple Contracts

```sql
-- Get distinct users who have access to any of the specified contracts
SELECT DISTINCT
  w.user_id,
  u.email,
  u.name,
  COUNT(DISTINCT w.contract_id) as contract_count
FROM users_who_can_see_contracts(
  ARRAY[123, 456, 789]::bigint[],
  'org-id'
) w
JOIN users u ON u.id = w.user_id
GROUP BY w.user_id, u.email, u.name
ORDER BY contract_count DESC;
```

### Find All Contracts Shared with Specific User

```sql
-- Find contracts explicitly shared with user (not via ownership/role)
SELECT c.id, c.vendor_id, cu.perm
FROM contracts c
JOIN contract_acl_user cu ON cu.contract_id = c.id
WHERE cu.user_id = 'user-id'
  AND cu.organization_id = 'org-id';
```

### Find Contracts Shared via Groups

```sql
-- Find contracts user has access to through group membership
SELECT
  c.id,
  c.vendor_id,
  g.name as group_name,
  cg.perm
FROM contracts c
JOIN contract_acl_group cg ON cg.contract_id = c.id
JOIN group_members gm ON gm.group_id = cg.group_id
JOIN groups g ON g.id = cg.group_id
WHERE gm.user_id = 'user-id'
  AND cg.organization_id = 'org-id';
```

## Common Use Cases

### Use Case 1: Display "Share Contract" Dialog

```typescript
async function getContractSharingInfo(contractId: number) {
  // Get current access list
  const viewers = await getUsersWhoCanSeeContracts(
    [contractId],
    userMetadata.organizationId,
  );

  // Get all org users for autocomplete
  const allUsers = await getOrgUsers(userMetadata.organizationId);

  // Filter out users who already have access
  const availableUsers = allUsers.filter(
    (user) => !viewers.some((v) => v.userId === user.id),
  );

  return {
    currentViewers: viewers,
    availableUsers,
  };
}
```

### Use Case 2: Validate Action Permission

```typescript
async function deleteContract(contractId: number) {
  // Check user has admin permission
  const canDelete = await checkContractAccess(
    contractId,
    userMetadata,
    'admin',
  );

  if (!canDelete) {
    throw new UnauthorizedError('Insufficient permissions to delete contract');
  }

  // Proceed with deletion
  await supabase.from('contracts').delete().eq('id', contractId);
}
```

### Use Case 3: Filter Dashboard by Access

```typescript
async function getDashboardContracts() {
  // Only fetch contracts user can access
  const contracts = await fetchContractsByACL({
    userMetadata,
    status: 'active',
    limit: 100,
  });

  // Separate by permission level
  const adminContracts = contracts.filter((c) => c.perm === 'admin');
  const editableContracts = contracts.filter(
    (c) => c.perm === 'write' || c.perm === 'admin',
  );
  const viewOnlyContracts = contracts.filter((c) => c.perm === 'read');

  return {
    adminContracts,
    editableContracts,
    viewOnlyContracts,
  };
}
```

### Use Case 4: Notify All Contract Viewers

```typescript
async function notifyContractChange(contractId: number, changeType: string) {
  // Get all users who can see this contract
  const viewers = await getUsersWhoCanSeeContracts(
    [contractId],
    organizationId,
  );

  // Send notification to each viewer
  await Promise.all(
    viewers.map((viewer) =>
      sendNotification(viewer.email, {
        type: 'contract_updated',
        contractId,
        changeType,
      }),
    ),
  );
}
```

### Use Case 5: Access Audit Report

```typescript
async function generateAccessAuditReport(contractId: number) {
  const viewers = await getUsersWhoCanSeeContracts(
    [contractId],
    organizationId,
  );

  // Categorize by access source
  const contract = await getContract(contractId);
  const explicitACL = await getContractACL(contractId);

  return {
    owner: contract.user_id,
    explicitGrants: explicitACL.users,
    groupGrants: explicitACL.groups,
    allViewers: viewers,
    totalViewers: viewers.length,
    adminCount: viewers.filter((v) => v.perm === 'admin').length,
    writeCount: viewers.filter((v) => v.perm === 'write').length,
    readCount: viewers.filter((v) => v.perm === 'read').length,
  };
}
```

### Use Case 6: Bulk Share Dialog for Multiple Contracts

```typescript
import { getUsersWhoCanSeeContracts } from '@/data/superuser/contracts';

async function getBulkContractSharingInfo(contractIds: number[]) {
  // Get access lists for all contracts in a single query
  const viewers = await getUsersWhoCanSeeContracts(
    contractIds,
    userMetadata.organizationId,
  );

  // Group users by contract ID
  const usersByContract = viewers.reduce(
    (acc, viewer) => {
      if (!acc[viewer.contractId]) {
        acc[viewer.contractId] = [];
      }
      acc[viewer.contractId].push({
        userId: viewer.userId,
        email: viewer.email,
        perm: viewer.perm,
      });
      return acc;
    },
    {} as Record<
      number,
      Array<{
        userId: string;
        email: string;
        perm: PermissionLevel;
      }>
    >,
  );

  // Find users who have access to ALL selected contracts
  const commonUsers = contractIds.reduce(
    (common, contractId) => {
      const contractUsers = new Set(
        (usersByContract[contractId] || []).map((u) => u.userId),
      );
      if (common === null) {
        return contractUsers;
      }
      return new Set([...common].filter((id) => contractUsers.has(id)));
    },
    null as Set<string> | null,
  );

  // Get all org users for autocomplete
  const allUsers = await getOrgUsers(userMetadata.organizationId);

  // Filter out users who already have access to all contracts
  const availableUsers = allUsers.filter((user) => !commonUsers?.has(user.id));

  return {
    usersByContract,
    commonUsers: Array.from(commonUsers || []),
    availableUsers,
    totalContracts: contractIds.length,
  };
}
```

### Use Case 7: Bulk Notify All Contract Viewers

```typescript
import { getUsersWhoCanSeeContracts } from '@/data/superuser/contracts';

async function notifyBulkContractChanges(
  contractIds: number[],
  changeType: string,
) {
  // Get all users who can see any of the contracts
  const viewers = await getUsersWhoCanSeeContracts(contractIds, organizationId);

  // Get unique users (a user might have access to multiple contracts)
  const uniqueUsers = new Map<
    string,
    {
      email: string;
      contractIds: number[];
    }
  >();

  viewers.forEach((viewer) => {
    if (!uniqueUsers.has(viewer.userId)) {
      uniqueUsers.set(viewer.userId, {
        email: viewer.email,
        contractIds: [],
      });
    }
    uniqueUsers.get(viewer.userId)!.contractIds.push(viewer.contractId);
  });

  // Send notification to each unique user
  await Promise.all(
    Array.from(uniqueUsers.values()).map((user) =>
      sendNotification(user.email, {
        type: 'bulk_contracts_updated',
        contractIds: user.contractIds,
        changeType,
        totalContracts: contractIds.length,
      }),
    ),
  );
}
```

### Use Case 8: Sharing Dialog with Permission Source Filtering

```typescript
import { getUsersWhoCanSeeContracts } from '@/data/superuser/contracts';

async function getContractSharingDialogData(contractId: number) {
  // Get all users with access including permission sources
  const allViewers = await getUsersWhoCanSeeContracts(
    [contractId],
    organizationId,
  );

  // Split users into categories based on permission sources
  const directAccessUsers = allViewers.filter((viewer) => {
    const sources = viewer.permissionSources;
    const hasDirectAccess =
      sources.includes('direct_acl') || sources.includes('contract_owner');
    const hasOnlySystemAccess = sources.every(
      (s) =>
        s === 'org_admin' ||
        s === 'folder_inheritance' ||
        s === 'folder_group_inheritance',
    );
    return hasDirectAccess && !hasOnlySystemAccess;
  });

  // System-level access (shown separately in "Managers & Admins" section)
  const systemAdmins = allViewers.filter((viewer) =>
    viewer.permissionSources.includes('org_admin'),
  );

  // Folder-inherited access (shown in "Inherited Access" section)
  const folderInheritedUsers = allViewers.filter((viewer) =>
    viewer.permissionSources.some(
      (s) => s === 'folder_inheritance' || s === 'folder_group_inheritance',
    ),
  );

  // Pending invitations
  const pendingInvites = directAccessUsers.filter((viewer) => !viewer.signedUp);

  return {
    // "Who has access" section - direct ACL + owners only
    currentUsers: directAccessUsers,

    // "Managers & Admins" section
    adminsAndManagers: systemAdmins,

    // "Inherited from Folder" section
    folderInheritedUsers,

    // Pending invitations badge
    pendingCount: pendingInvites.length,

    // Total access count
    totalUsers: allViewers.length,
  };
}
```

### Use Case 9: Permission Source Audit Report

```typescript
import { getUsersWhoCanSeeContracts } from '@/data/superuser/contracts';

async function generatePermissionSourceAudit(contractIds: number[]) {
  const viewers = await getUsersWhoCanSeeContracts(contractIds, organizationId);

  // Categorize users by their permission sources
  const sourceBreakdown = viewers.reduce(
    (acc, viewer) => {
      viewer.permissionSources.forEach((source) => {
        if (!acc[source]) {
          acc[source] = {
            count: 0,
            users: new Set<string>(),
          };
        }
        acc[source].count++;
        acc[source].users.add(viewer.userId);
      });
      return acc;
    },
    {} as Record<string, { count: number; users: Set<string> }>,
  );

  // Find users with multiple permission sources
  const usersWithMultipleSources = viewers.filter(
    (viewer) => viewer.permissionSources.length > 1,
  );

  // Find potential over-permissioned users
  // (users who have both direct ACL and org_admin)
  const overPermissioned = viewers.filter(
    (viewer) =>
      viewer.permissionSources.includes('org_admin') &&
      viewer.permissionSources.includes('direct_acl'),
  );

  return {
    totalUsers: new Set(viewers.map((v) => v.userId)).size,
    totalAccessGrants: viewers.length,
    sourceBreakdown: Object.entries(sourceBreakdown).map(([source, data]) => ({
      source,
      grantCount: data.count,
      uniqueUsers: data.users.size,
    })),
    usersWithMultipleSources: usersWithMultipleSources.length,
    potentialOverPermissioned: overPermissioned.length,
    pendingInvitations: viewers.filter((v) => !v.signedUp).length,
  };
}
```

## Security Considerations

### Function Security

| Function                      | Security Mode      | Who Can Call                              |
| ----------------------------- | ------------------ | ----------------------------------------- |
| `contracts_visible_to`        | `STABLE`           | Any authenticated user (self-limiting)    |
| `users_who_can_see_contracts` | `SECURITY DEFINER` | Authenticated users (app validates admin) |
| `checkContractAccess`         | Application        | Any authenticated user (self-limiting)    |
| `getContractACL`              | Application        | Authenticated users (RLS applies)         |

### Best Practices

1. **Always validate organization context**

   ```typescript
   // Ensure org_id matches user's org
   if (organizationId !== userMetadata.organizationId) {
     throw new Error('Organization mismatch');
   }
   ```

2. **Use service client for sensitive operations**

   ```typescript
   // Use service client to bypass RLS when needed
   const supabase = createServiceClient();
   ```

3. **Validate admin access before showing access lists**

   ```typescript
   // Don't expose who has access unless user is admin
   const canManage = await checkContractAccess(
     contractId,
     userMetadata,
     'admin',
   );

   if (!canManage) {
     throw new UnauthorizedError('Cannot view access list');
   }
   ```

4. **Audit access changes**
   ```typescript
   // Log all permission changes
   await logAuditEvent({
     action: 'grant_contract_access',
     contractId,
     targetUserId,
     permission,
     performedBy: userMetadata.userId,
   });
   ```

### Common Security Pitfalls

❌ **Don't expose `users_who_can_see_contracts` without validation**

```typescript
// BAD - Anyone can see who has access
export async function GET(req: Request) {
  const { contractId } = await req.json();
  return getUsersWhoCanSeeContracts([contractId], orgId);
}

// BAD - Bulk version also needs validation
export async function POST(req: Request) {
  const { contractIds } = await req.json();
  const { data } = await supabase.rpc('users_who_can_see_contracts', {
    p_contract_ids: contractIds,
    p_organization_id: orgId,
  });
  return data;
}
```

✅ **Validate admin access first**

```typescript
// GOOD - Only admins can see access list (single contract)
import { getUsersWhoCanSeeContracts } from '@/data/superuser/contracts';

export async function GET(req: Request) {
  const userMetadata = await getUserMetadata();
  const { contractId } = await req.json();

  const canManage = await checkContractAccess(
    contractId,
    userMetadata,
    'admin',
  );

  if (!canManage) {
    return new Response('Unauthorized', { status: 403 });
  }

  return getUsersWhoCanSeeContracts([contractId], userMetadata.organizationId);
}

// GOOD - Validate admin access for all contracts (bulk)

export async function POST(req: Request) {
  const userMetadata = await getUserMetadata();
  const { contractIds } = await req.json();

  // Verify user has admin access to ALL requested contracts
  const accessChecks = await Promise.all(
    contractIds.map((id) => checkContractAccess(id, userMetadata, 'admin')),
  );

  if (!accessChecks.every((hasAccess) => hasAccess)) {
    return new Response('Unauthorized', { status: 403 });
  }

  // Also validate organization_id matches
  if (contractIds.length > 100) {
    return new Response('Too many contracts', { status: 400 });
  }

  const viewers = await getUsersWhoCanSeeContracts(
    contractIds,
    userMetadata.organizationId,
  );

  return viewers;
}
```

## Troubleshooting

### User Can't See Expected Contracts

**Check:**

1. User has organization_id set correctly

   ```sql
   SELECT id, email, organization_id FROM users WHERE id = 'user-id';
   ```

2. Contracts have organization_id populated

   ```sql
   SELECT id, vendor_id, organization_id FROM contracts WHERE id = 123;
   ```

3. User has at least one access grant

   ```sql
   -- Check all access sources

   -- Direct grant?
   SELECT * FROM contract_acl_user
   WHERE user_id = 'user-id' AND contract_id = 123;

   -- Via group?
   SELECT * FROM contract_acl_group cg
   JOIN group_members gm ON gm.group_id = cg.group_id
   WHERE gm.user_id = 'user-id' AND cg.contract_id = 123;

   -- Is owner?
   SELECT * FROM contracts
   WHERE id = 123 AND user_id = 'user-id';

   -- Has admin role?
   SELECT ur.role_id FROM user_roles2 ur
   WHERE ur.user_id = 'user-id';
   ```

### Wrong Permission Level

**Remember:** System uses MAXIMUM permission across all sources.

**Debug:**

```sql
-- Check all permission sources
WITH user_perms AS (
  -- Direct
  SELECT 'direct' as source, cu.perm
  FROM contract_acl_user cu
  WHERE cu.contract_id = 123 AND cu.user_id = 'user-id'

  UNION ALL

  -- Via group
  SELECT 'group: ' || g.name as source, cg.perm
  FROM contract_acl_group cg
  JOIN group_members gm ON gm.group_id = cg.group_id
  JOIN groups g ON g.id = cg.group_id
  WHERE cg.contract_id = 123 AND gm.user_id = 'user-id'

  UNION ALL

  -- Owner?
  SELECT 'owner' as source, 'admin'::permission_level as perm
  FROM contracts
  WHERE id = 123 AND user_id = 'user-id'
)
SELECT source, perm FROM user_perms;
```

### Performance Issues

**Check indexes:**

```sql
-- Verify ACL indexes exist
SELECT tablename, indexname
FROM pg_indexes
WHERE tablename IN (
  'contract_acl_user',
  'contract_acl_group',
  'group_members',
  'folder_contracts',
  'folder_acl_user'
);
```

**Profile the function:**

```sql
EXPLAIN ANALYZE
SELECT * FROM contracts_visible_to('org-id', 'user-id');
```

**Consider caching:**

```typescript
// Cache visible contract IDs for 5 minutes
import { getCachedContractIds } from '@/lib/redis/contract-cache';

const contractIds = await getCachedContractIds(
  userId,
  organizationId,
  { ttl: 300 }, // 5 minutes
);
```

### Function Returns Empty Results

**Common causes:**

1. ❌ Wrong organization_id passed
2. ❌ User deleted or deactivated
3. ❌ No ACL grants and user is not owner/admin
4. ❌ Folder ACLs misconfigured

**Debug:**

```sql
-- Test with service role user (should see all)
SELECT * FROM contracts WHERE organization_id = 'org-id';

-- Check if function works for any user
SELECT COUNT(*) FROM contracts_visible_to('org-id', 'any-admin-user-id');
```

## Related Documentation

- [ACL Quick Reference](./ACL_QUICK_REFERENCE.md) - Quick start guide
- [ACL Migration Guide](./ACL_MIGRATION_GUIDE.md) - Migration from old system
- [ACL Implementation Summary](./ACL_IMPLEMENTATION_SUMMARY.md) - Technical details
- [Security Headers](./SECURITY-HEADERS.md) - Security configuration

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review SQL query with `EXPLAIN ANALYZE`
3. Check application logs for permission denials
4. Verify user roles and organization membership
