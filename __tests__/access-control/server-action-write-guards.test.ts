jest.mock('@/utils/pino', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

const mockGetUserMetadata = jest.fn<Promise<unknown>, []>();
jest.mock('@/data/users', () => ({
  getUserMetadata: () => mockGetUserMetadata(),
}));

const mockCheckAbility = jest.fn<Promise<boolean>, unknown[]>();
jest.mock('@/data/user-permissions', () => ({
  checkAbility: (...args: unknown[]) => mockCheckAbility(...args),
}));

const mockUpdate = jest.fn();
const mockInsert = jest.fn();
const mockSelect = jest.fn();
jest.mock('@/utils/supabase/service_server', () => ({
  createClient: () => ({
    from: () => ({
      select: (...args: unknown[]) => {
        mockSelect(...args);
        return {
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: { organization_id: 'org-1', deleted_at: null },
                error: null,
              }),
          }),
        };
      },
      insert: (...args: unknown[]) => {
        mockInsert(...args);
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 1 }, error: null }),
          }),
        };
      },
      update: (...args: unknown[]) => {
        mockUpdate(...args);
        return { eq: () => ({ is: () => Promise.resolve({ error: null }) }) };
      },
    }),
  }),
}));

jest.mock('@/lib/v2/org-units', () => ({
  getBusinessGroupsByLeaf: jest.fn(async () => new Map()),
  syncOrgUnitsForEmployees: jest.fn(async () => undefined),
}));

import {
  addOrgEmployee,
  addOrgEmployees,
  updateOrgEmployee,
  deleteOrgEmployee,
} from '@/data/superuser/org-employees';
import { AuthorizationError } from '@/lib/errors';
import { userRoles } from '@/constants/data';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserMetadata.mockResolvedValue({
    userId: 'user-1',
    organizationId: 'org-1',
    userRole: userRoles.clientUser,
  });
  mockCheckAbility.mockResolvedValue(false);
  mockSelect.mockClear();
});

describe('org employee server actions', () => {
  it('refuses to add an employee without manage Organization', async () => {
    await expect(
      addOrgEmployee({
        organizationId: 'org-1',
        first_name: 'A',
        last_name: 'B',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('refuses to update an employee without manage Organization', async () => {
    await expect(
      updateOrgEmployee({ employeeId: 1, first_name: 'A', last_name: 'B' }),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('refuses to delete an employee without manage Organization', async () => {
    await expect(deleteOrgEmployee(1)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('checks the ability before the employee lookup runs', async () => {
    await expect(deleteOrgEmployee(1)).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    expect(mockCheckAbility).toHaveBeenCalledWith('manage', 'Organization');
    // Order matters: a guard that ran after the lookup would still satisfy the
    // assertion above while leaking whether an employee id exists.
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('refuses a bulk import without manage Organization', async () => {
    await expect(
      addOrgEmployees([
        {
          organization_id: 'org-1',
          first_name: 'A',
          last_name: 'B',
        } as never,
      ]),
    ).rejects.toBeInstanceOf(AuthorizationError);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('lets an authorized caller through', async () => {
    mockCheckAbility.mockResolvedValue(true);
    await expect(deleteOrgEmployee(1)).resolves.toBeUndefined();
    expect(mockUpdate).toHaveBeenCalled();
  });
});
