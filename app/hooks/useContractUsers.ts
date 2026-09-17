import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { z } from 'zod';
import {
  getContractUsers,
  addContractUser,
  addContractUserAssignments,
  deleteContractUser,
  releaseContractUsers,
  updateContractUser,
} from '@/data/superuser/contracts';
import { updateOrgEmployee } from '@/data/superuser/org-employees';
import { logUserChanged } from '@/data/superuser/activities';
import { getUserMetadata } from '@/data/users';
import { BusinessGroup, VendorProduct } from '@/constants/types';
import logger from '@/utils/pino';

export const userSchema = z
  .object({
    name: z.string().min(1, { error: 'Name is required' }),
    email: z
      .string()
      .email({ error: 'Invalid email format' })
      .or(z.literal(''))
      .optional(),
    product_id: z.string().min(1, { error: 'Product is required' }),
    employee_id: z.string().optional(),
    region: z.string().optional(),
    country: z.string().optional(),
    division: z.string().optional(),
    department: z.string().optional(),
    cost_center: z.string().optional(),
    entity: z.string().optional(),
    business_unit: z.string().optional(),
    team: z.string().optional(),
    business_group_node_id: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v) => {
        if (v === undefined || v === null) return undefined;
        if (typeof v === 'string' && v.trim() === '') return undefined;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isFinite(n) ? n : undefined;
      }),
    start_date: z.string().optional(),
    leave_date: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.start_date &&
      data.leave_date &&
      data.leave_date < data.start_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Leave date cannot be earlier than start date',
        path: ['leave_date'],
      });
    }
  });

export type User = {
  id: number;
  name: string;
  email: string | null;
  contract_id: number | null;
  created_at: string;
  updated_at: string | null;
  product_id: number | null;
  vendor_products: VendorProduct | null;
  employee_id: string | null;
  region: string | null;
  country: string | null;
  division: string | null;
  department: string | null;
  cost_center: string | null;
  entity: string | null;
  business_unit: string | null;
  team: string | null;
  businessGroup: BusinessGroup | null;
  start_date: string | null;
  leave_date: string | null;
  org_employee_id: number | null;
  status: 'active' | 'inactive' | 'on_leave';
};

export type FormErrors = {
  name?: string;
  email?: string;
  product_id?: string;
  employee_id?: string;
  region?: string;
  country?: string;
  division?: string;
  department?: string;
  cost_center?: string;
  entity?: string;
  business_unit?: string;
  team?: string;
  business_group_node_id?: string;
  start_date?: string;
  leave_date?: string;
};

export function useContractUsers(
  contractId: number,
  vendorProducts?: VendorProduct[],
  defaultProductId?: string | number,
  skipProductValidation?: boolean,
  enabled: boolean = true,
) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isUpdatingUser, setIsUpdatingUser] = useState(false);
  const defaultNewUser = {
    name: '',
    email: '',
    product_id: defaultProductId ? defaultProductId.toString() : 'ALL_PRODUCTS',
    employee_id: '',
    region: '',
    country: '',
    division: '',
    department: '',
    cost_center: '',
    entity: '',
    business_unit: '',
    team: '',
    business_group_node_id: '',
    start_date: '',
    leave_date: '',
  };
  const [newUser, setNewUser] = useState(defaultNewUser);
  const [errors, setErrors] = useState<FormErrors>({});
  const [currentUser, setCurrentUser] = useState<{
    userId?: string;
    userProfile?: { name?: string | null } | null;
  } | null>(null);
  const { toast } = useToast();

  const loadUsers = useCallback(
    async (signal?: { cancelled: boolean }) => {
      try {
        const data = await getContractUsers(contractId);
        if (signal?.cancelled) return;
        setUsers(
          (data || []).map((cu) => {
            const oe = cu.org_employees;
            if (!oe)
              return {
                ...cu,
                entity: null,
                business_unit: null,
                team: null,
                businessGroup: null,
                status: 'active' as const,
              };
            return {
              ...cu,
              name: `${oe.first_name} ${oe.last_name}`.trim(),
              email: oe.email,
              employee_id: oe.employee_id,
              region: oe.region,
              country: oe.country,
              division: oe.division,
              department: oe.department,
              cost_center: oe.cost_center,
              entity: oe.entity,
              business_unit: oe.business_unit,
              team: oe.team,
              businessGroup: oe.businessGroup,
              start_date: oe.start_date,
              leave_date: oe.leave_date,
              // Deleted employees still hold the seat until it's released —
              // surface them as inactive instead of hiding the row
              status: oe.deleted_at ? ('inactive' as const) : oe.status,
            };
          }),
        );
      } catch (error) {
        if (signal?.cancelled) return;
        toast({ title: 'Error', description: 'Error loading users' });
      } finally {
        if (!signal?.cancelled) setLoading(false);
      }
    },
    [contractId, toast],
  );

  useEffect(() => {
    if (!enabled) return;
    const signal = { cancelled: false };
    loadUsers(signal);
    loadCurrentUser();
    return () => {
      signal.cancelled = true;
    };
  }, [contractId, enabled, loadUsers]);

  async function loadCurrentUser() {
    try {
      const userData = await getUserMetadata();
      if (userData) {
        setCurrentUser({
          userId: userData.userId,
          userProfile: userData.userProfile,
        });
      }
    } catch (error) {
      logger.warn({ err: error }, 'Could not load current user');
    }
  }

  async function handleAddUser(): Promise<boolean> {
    if (isAddingUser) return false;

    setIsAddingUser(true);
    try {
      const validatedData = userSchema.parse(newUser);

      // Convert empty-string optional fields to undefined so the DB doesn't
      // receive invalid values (e.g. date: "").
      const optional = <T extends string | number | undefined>(v: T) =>
        typeof v === 'string' && v.trim() === '' ? undefined : v;

      // Business group is deliberately dropped here: this path mints an
      // unlinked contract_users seat, and group membership lives on
      // org_employees.org_unit_id, which such a seat has no row to carry.
      const optionalPayload = {
        employee_id: optional(validatedData.employee_id),
        region: optional(validatedData.region),
        country: optional(validatedData.country),
        division: optional(validatedData.division),
        department: optional(validatedData.department),
        cost_center: optional(validatedData.cost_center),
        start_date: optional(validatedData.start_date),
        leave_date: optional(validatedData.leave_date),
      };

      if (
        newUser.product_id === 'ALL_PRODUCTS' &&
        Array.isArray(vendorProducts) &&
        vendorProducts.length > 0
      ) {
        const uniqueProductIds = Array.from(
          new Set(vendorProducts.map((p) => p.id)),
        );

        const promises = uniqueProductIds.map((productId) =>
          addContractUser({
            contractId,
            name: validatedData.name,
            email: validatedData.email,
            product_id: productId,
            ...optionalPayload,
          }),
        );

        await Promise.all(promises);

        try {
          await logUserChanged({
            contractId,
            action: 'added',
            userName: validatedData.name,
            productIds: uniqueProductIds,
            changedBy: currentUser?.userId ?? undefined,
          });
        } catch (logError) {
          logger.warn(
            { err: logError, contractId },
            'Failed to log user addition',
          );
        }

        toast({
          title: 'Success',
          description: `User added successfully to ${uniqueProductIds.length} products`,
        });
      } else {
        // Use defaultProductId when skipping product validation (single product context)
        const productIdToUse =
          skipProductValidation && defaultProductId
            ? Number(defaultProductId)
            : parseInt(validatedData.product_id, 10);

        await addContractUser({
          contractId,
          name: validatedData.name,
          email: validatedData.email,
          product_id: productIdToUse,
          ...optionalPayload,
        });

        try {
          await logUserChanged({
            contractId,
            action: 'added',
            userName: validatedData.name,
            productIds: [productIdToUse],
            changedBy: currentUser?.userId ?? undefined,
          });
        } catch (logError) {
          logger.warn(
            { err: logError, contractId },
            'Failed to log user addition',
          );
        }

        toast({ title: 'Success', description: 'User added successfully' });
      }

      setNewUser(defaultNewUser);
      setErrors({});
      await loadUsers();
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formErrors: FormErrors = {};
        error.issues.forEach((err) => {
          if (err.path[0]) {
            formErrors[err.path[0] as keyof FormErrors] = err.message;
          }
        });
        setErrors(formErrors);
      } else {
        toast({
          title: 'Error',
          description: 'Error adding user',
          variant: 'destructive',
        });
      }

      return false;
    } finally {
      setIsAddingUser(false);
    }
  }

  function clearFieldError(field: keyof FormErrors) {
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function resetErrors() {
    setErrors({});
  }

  async function handleUpdateUser(
    userId: number,
    draft: typeof defaultNewUser,
  ): Promise<boolean> {
    if (isUpdatingUser) return false;
    setIsUpdatingUser(true);

    try {
      const validatedData = userSchema.parse(draft);

      const optional = <T extends string | number | undefined>(v: T) =>
        typeof v === 'string' && v.trim() === '' ? undefined : v;

      const optionalPayload = {
        employee_id: optional(validatedData.employee_id),
        region: optional(validatedData.region),
        country: optional(validatedData.country),
        division: optional(validatedData.division),
        department: optional(validatedData.department),
        cost_center: optional(validatedData.cost_center),
        start_date: optional(validatedData.start_date),
        leave_date: optional(validatedData.leave_date),
      };

      const business_group_node_id =
        draft.business_group_node_id === ''
          ? null
          : (validatedData.business_group_node_id ?? undefined);

      const productIdToUse =
        skipProductValidation && defaultProductId
          ? Number(defaultProductId)
          : parseInt(validatedData.product_id, 10);

      const existingUser = users.find((u) => u.id === userId);

      if (existingUser?.org_employee_id) {
        // Update org_employees as the source of truth
        const nameParts = validatedData.name.trim().split(/\s+/);
        const first_name = nameParts[0] || '';
        const last_name = nameParts.slice(1).join(' ') || '';

        await updateOrgEmployee({
          employeeId: existingUser.org_employee_id,
          first_name,
          last_name,
          email: validatedData.email || undefined,
          ...optionalPayload,
          business_group_node_id,
          // entity/business_unit/team live only on org_employees, not contract_users
          entity: optional(validatedData.entity),
          business_unit: optional(validatedData.business_unit),
          team: optional(validatedData.team),
        });

        // Sync denormalized fields on contract_users
        await updateContractUser({
          userId,
          name: validatedData.name,
          email: validatedData.email,
          product_id: productIdToUse,
          ...optionalPayload,
        });
      } else {
        await updateContractUser({
          userId,
          name: validatedData.name,
          email: validatedData.email,
          product_id: productIdToUse,
          ...optionalPayload,
        });
      }

      // NOTE: logUserChanged currently supports only 'added' | 'removed'.

      toast({ title: 'Success', description: 'User updated successfully' });
      setErrors({});
      await loadUsers();
      return true;
    } catch (error) {
      if (error instanceof z.ZodError) {
        const formErrors: FormErrors = {};
        error.issues.forEach((err) => {
          if (err.path[0]) {
            formErrors[err.path[0] as keyof FormErrors] = err.message;
          }
        });
        setErrors(formErrors);
      } else {
        toast({
          title: 'Error',
          description: 'Error updating user',
          variant: 'destructive',
        });
      }
      return false;
    } finally {
      setIsUpdatingUser(false);
    }
  }

  async function handleAssignEmployees({
    employees: selectedEmployees,
    productId,
  }: {
    employees: {
      id: number;
      first_name: string;
      last_name: string;
      email: string | null;
    }[];
    productId?: number | string;
  }): Promise<boolean> {
    if (isAddingUser || selectedEmployees.length === 0) return false;
    setIsAddingUser(true);

    try {
      const resolvedProductId = productId ?? defaultProductId;

      const productIds: number[] =
        (!resolvedProductId || resolvedProductId === 'ALL_PRODUCTS') &&
        Array.isArray(vendorProducts) &&
        vendorProducts.length > 0
          ? Array.from(new Set(vendorProducts.map((p) => p.id)))
          : [
              typeof resolvedProductId === 'string'
                ? parseInt(resolvedProductId, 10)
                : Number(resolvedProductId),
            ];

      const createdAt = new Date().toISOString();
      const assignments = selectedEmployees.flatMap((emp) =>
        productIds.map((pid) => ({
          contract_id: contractId,
          org_employee_id: emp.id,
          product_id: pid,
          created_at: createdAt,
        })),
      );

      await addContractUserAssignments(assignments);

      try {
        await logUserChanged({
          contractId,
          action: 'added',
          userNames: selectedEmployees.map(
            (e) => `${e.first_name} ${e.last_name}`,
          ),
          productIds,
          changedBy: currentUser?.userId ?? undefined,
        });
      } catch (logError) {
        logger.warn(
          { err: logError, contractId },
          'Failed to log user addition',
        );
      }

      const count = selectedEmployees.length;
      toast({
        title: 'Success',
        description: `${count} employee${count > 1 ? 's' : ''} assigned`,
      });

      await loadUsers();
      return true;
    } catch (error) {
      logger.error({ err: error, contractId }, 'Error assigning employees');
      toast({
        title: 'Error',
        description: 'Error assigning employees',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsAddingUser(false);
    }
  }

  function resetForm() {
    setNewUser(defaultNewUser);
    setErrors({});
  }

  async function handleDeleteUser(userId: number) {
    try {
      const userToDelete = users.find((user) => user.id === userId);

      await deleteContractUser(userId);

      if (userToDelete) {
        try {
          await logUserChanged({
            contractId,
            action: 'removed',
            userName: userToDelete.name,
            changedBy: currentUser?.userId ?? undefined,
          });
        } catch (logError) {
          logger.warn(
            { err: logError, contractId },
            'Failed to log user removal',
          );
        }
      }

      await loadUsers();
      toast({ title: 'Success', description: 'User removed successfully' });
    } catch (error) {
      toast({ title: 'Error', description: 'Error removing user' });
    }
  }

  async function handleReleaseUsers(userIds: number[]): Promise<boolean> {
    if (userIds.length === 0) return false;
    try {
      const releasedIds = await releaseContractUsers(userIds);

      if (releasedIds.length > 0) {
        const names = releasedIds
          .map((id) => users.find((u) => u.id === id)?.name)
          .filter((name): name is string => !!name);

        try {
          await logUserChanged({
            contractId,
            action: 'released',
            ...(names.length === 1
              ? { userName: names[0] }
              : { userNames: names }),
            changedBy: currentUser?.userId ?? undefined,
          });
        } catch (logError) {
          logger.warn(
            { err: logError, contractId },
            'Failed to log seat release',
          );
        }
      }

      await loadUsers();
      toast({
        title: 'Success',
        description:
          releasedIds.length === 0
            ? 'Seats were already released'
            : releasedIds.length === 1
              ? 'Seat released successfully'
              : `${releasedIds.length} seats released successfully`,
      });
      return true;
    } catch (error) {
      toast({ title: 'Error', description: 'Error releasing seats' });
      return false;
    }
  }

  async function handleReleaseUser(userId: number): Promise<boolean> {
    return handleReleaseUsers([userId]);
  }

  return {
    users,
    loading,
    isAddingUser,
    isUpdatingUser,
    newUser,
    setNewUser,
    errors,
    resetForm,
    handleAddUser,
    handleAssignEmployees,
    handleUpdateUser,
    handleDeleteUser,
    handleReleaseUser,
    handleReleaseUsers,
    loadUsers,
    resetErrors,
    clearFieldError,
  };
}
