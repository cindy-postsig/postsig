'use client';

import { useCallback, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  useInvalidateOrgEmployees,
  useOrgEmployees,
} from '@/hooks/api/useOrgEmployees';
import { AddEmployeeDialog } from '@/components/contracts/AddEmployeeDialog';
import type { OrgEmployee, VendorProduct } from '@/constants/types';
import { PlusIcon } from '@radix-ui/react-icons';

interface EmployeeAssignmentDialogProps {
  organizationId: string;
  vendorProducts?: VendorProduct[];
  hideProductSelect?: boolean;
  defaultProductId?: number;
  orgGroups?: Array<{ id: number; name: string }>;
  onAssign: (params: {
    employees: {
      id: number;
      first_name: string;
      last_name: string;
      email: string | null;
    }[];
    productId?: number | string;
  }) => Promise<boolean>;
  onClose: () => void;
  disabled?: boolean;
  existingUserEmails?: string[];
  existingOrgEmployeeIds?: number[];
}

export function EmployeeAssignmentDialog({
  organizationId,
  vendorProducts,
  hideProductSelect,
  defaultProductId,
  orgGroups,
  onAssign,
  onClose,
  disabled,
  existingUserEmails = [],
  existingOrgEmployeeIds = [],
}: EmployeeAssignmentDialogProps) {
  const { data: allEmployees = [], isLoading: loading } =
    useOrgEmployees(organizationId);
  const invalidateOrgEmployees = useInvalidateOrgEmployees();
  const employees = useMemo(
    () => allEmployees.filter((e) => e.status === 'active'),
    [allEmployees],
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [productId, setProductId] = useState<string>(
    defaultProductId ? defaultProductId.toString() : 'ALL_PRODUCTS',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const existingEmails = useMemo(
    () => new Set(existingUserEmails.map((e) => e.toLowerCase())),
    [existingUserEmails],
  );

  const existingEmployeeIdSet = useMemo(
    () => new Set(existingOrgEmployeeIds),
    [existingOrgEmployeeIds],
  );

  const allEmails = useMemo(
    () =>
      new Set<string>([
        ...existingUserEmails.map((e) => e.toLowerCase()),
        ...employees
          .map((e) => e.email?.toLowerCase())
          .filter((e): e is string => !!e),
      ]),
    [existingUserEmails, employees],
  );

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase();
    return employees.filter((emp) => {
      const first = emp.first_name.toLowerCase();
      const last = emp.last_name.toLowerCase();
      return (
        first.includes(q) ||
        last.includes(q) ||
        `${first} ${last}`.includes(q) ||
        (emp.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [employees, searchQuery]);

  const isAlreadyAssigned = useCallback(
    (emp: OrgEmployee) =>
      existingEmployeeIdSet.has(emp.id) ||
      (!!emp.email && existingEmails.has(emp.email.toLowerCase())),
    [existingEmployeeIdSet, existingEmails],
  );

  const availableEmployees = useMemo(
    () => filteredEmployees.filter((emp) => !isAlreadyAssigned(emp)),
    [filteredEmployees, isAlreadyAssigned],
  );

  const toggleEmployee = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === availableEmployees.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(availableEmployees.map((e) => e.id)));
    }
  };

  const handleEmployeeAdded = async (created: OrgEmployee) => {
    await invalidateOrgEmployees(organizationId);
    setSelectedIds((prev) => new Set([...prev, created.id]));
  };

  const handleSubmit = async () => {
    if (selectedIds.size === 0 || isSubmitting) return;
    setIsSubmitting(true);

    const selectedEmployees = employees
      .filter((e) => selectedIds.has(e.id))
      .map((e) => ({
        id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
        email: e.email,
      }));

    const ok = await onAssign({
      employees: selectedEmployees,
      productId: hideProductSelect ? defaultProductId : productId,
    });

    setIsSubmitting(false);
    if (ok) onClose();
  };

  return (
    <div className="space-y-4">
      {/* Product selection */}
      {!hideProductSelect && vendorProducts && vendorProducts.length > 0 && (
        <div className="space-y-1">
          <Label className="font-medium">Product</Label>
          <Select value={productId} onValueChange={setProductId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Products</SelectLabel>
                <SelectItem value="ALL_PRODUCTS">All Products</SelectItem>
                <SelectSeparator />
                {vendorProducts.map((p) => (
                  <SelectItem key={p.id} value={p.id.toString()}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Employee multi-select */}
      <div className="space-y-2">
        <div className="flex h-5 items-end justify-between">
          <div className="flex items-center gap-2">
            <Label className="font-medium">Employees</Label>
            <a
              href="/settings/employees"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Manage directory ↗
            </a>
          </div>
          {selectedIds.size > 0 && (
            <span className="text-xs text-muted-foreground">
              {selectedIds.size} selected
              {' · '}
              <button
                className="underline hover:text-foreground"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear
              </button>
            </span>
          )}
        </div>
        <Input
          placeholder="Search by name or email..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-9 text-sm"
          autoFocus
        />
      </div>

      <ScrollArea className="h-[300px] rounded-md border">
        {loading ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground">
            Loading employees...
          </div>
        ) : filteredEmployees.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
            {searchQuery
              ? 'No employees found matching your search.'
              : 'No employees in the directory yet.'}
          </div>
        ) : (
          <div>
            {/* Select all */}
            {availableEmployees.length > 1 && (
              <button
                className="flex w-full items-center gap-3 border-b bg-muted/30 px-4 py-2 text-left"
                onClick={toggleAll}
              >
                <Checkbox
                  checked={
                    selectedIds.size === availableEmployees.length &&
                    availableEmployees.length > 0
                  }
                />
                <span className="font-medium text-xs text-muted-foreground">
                  Select all ({availableEmployees.length})
                </span>
              </button>
            )}

            <div className="divide-y">
              {filteredEmployees.map((employee) => {
                const alreadyAssigned = isAlreadyAssigned(employee);
                const isSelected = selectedIds.has(employee.id);

                return (
                  <button
                    key={employee.id}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:opacity-50"
                    onClick={() => toggleEmployee(employee.id)}
                    disabled={alreadyAssigned}
                  >
                    <Checkbox checked={isSelected} disabled={alreadyAssigned} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium break-all text-sm">
                        {employee.first_name} {employee.last_name}
                      </p>
                      <p className="break-all text-xs text-muted-foreground">
                        {employee.email || ''}
                      </p>
                    </div>
                    {employee.department && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {employee.department}
                        </Badge>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </ScrollArea>

      <button
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setShowAddDialog(true)}
      >
        <PlusIcon className="h-3 w-3" />
        Add new employee
      </button>

      <AddEmployeeDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        organizationId={organizationId}
        orgGroups={orgGroups}
        existingEmails={allEmails}
        onSaved={handleEmployeeAdded}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={disabled || isSubmitting || selectedIds.size === 0}
        >
          {isSubmitting
            ? 'Assigning...'
            : `Assign ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`}
        </Button>
      </div>
    </div>
  );
}
