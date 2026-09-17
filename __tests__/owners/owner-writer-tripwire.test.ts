import * as fs from 'fs';
import * as path from 'path';

// Ownership, sharing and cost allocation are three stores (psk-1975). The
// owner path writes `contract_owners` and nothing else: not an ACL row (the
// old diff-and-delete removed share-dialog rows too), not an allocation.
const FORBIDDEN = [
  'addGroupToContract',
  'removeGroupFromContract',
  'contract_acl_group',
  'updateContractBusinessGroups',
  'useUpdateContractBusinessGroups',
  'saveContractAllocation',
  'contract_cost_allocations',
  'useSaveContractBusinessGroups',
  'useContractBusinessGroupField',
];

const OWNER_PATH = [
  'lib/v2/owners/service.ts',
  'lib/v2/owners/catalog.ts',
  'app/api/v2/handlers/contracts/owners.ts',
  'app/ui/contracts/owner.tsx',
  'app/(app)/(cpm)/upload/CpmRowEditContext.tsx',
  'app/lib/mcp/update-contract.ts',
  'hooks/api/useOwners.ts',
];

// The owner editors are client components: they save through the v2 API, not
// a server action or a direct data-layer call (psk-1975).
const OWNER_EDITORS = [
  'app/ui/contracts/owner.tsx',
  'app/(app)/(cpm)/upload/CpmRowEditContext.tsx',
];

const readSource = (file: string) =>
  fs.readFileSync(path.resolve(__dirname, '..', '..', file), 'utf8');

describe('the owner path never writes ACLs or allocations', () => {
  it.each(OWNER_PATH)('%s references no ACL or allocation writer', (file) => {
    const source = readSource(file);
    for (const writer of FORBIDDEN) {
      expect(source).not.toContain(writer);
    }
  });
});

describe('the owner editors reach the server only through the v2 API', () => {
  it.each(OWNER_EDITORS)('%s imports no server module', (file) => {
    const source = readSource(file);
    expect(source).not.toMatch(/from '@\/data\/superuser/);
    expect(source).not.toMatch(/from '@\/app\/lib\/actions/);
  });
});
