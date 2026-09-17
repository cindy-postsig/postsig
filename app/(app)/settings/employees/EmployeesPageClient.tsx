'use client';

import { useCallback, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/ui/use-toast';
import { EmployeesTable } from '@/components/settings/EmployeesTable';
import { ImportEmployees } from '@/components/settings/employee-import/ImportEmployees';
import { ViewEmployeeDialog } from '@/components/settings/ViewEmployeeDialog';
import { AddEmployeeDialog } from '@/components/contracts/AddEmployeeDialog';
import {
  deleteOrgEmployee,
  getOrgEmployees,
} from '@/data/superuser/org-employees';
import type { OrgEmployee } from '@/constants/types';
import type { EmployeeImportMapping } from '@/lib/v2/employee-import/types';
import { useAbility } from '@/components/providers/AbilityProvider';
import logger from '@/utils/pino';

interface EmployeesPageClientProps {
  organizationId: string;
  initialEmployees: OrgEmployee[];
  orgGroups: Array<{ id: number; name: string }>;
  initialImportMapping: EmployeeImportMapping | null;
}

export function EmployeesPageClient({
  organizationId,
  initialEmployees,
  orgGroups,
  initialImportMapping,
}: EmployeesPageClientProps) {
  const [importMapping, setImportMapping] = useState(initialImportMapping);
  const [employees, setEmployees] = useState(initialEmployees);
  const [search, setSearch] = useState('');
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<OrgEmployee | null>(
    null,
  );
  const [viewingEmployee, setViewingEmployee] = useState<OrgEmployee | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<OrgEmployee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const ability = useAbility();
  const canImport = ability.can('manage', 'Group');

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((emp) => {
      const first = emp.first_name.toLowerCase();
      const last = emp.last_name.toLowerCase();
      return (
        first.includes(q) ||
        last.includes(q) ||
        `${first} ${last}`.includes(q) ||
        (emp.email?.toLowerCase().includes(q) ?? false) ||
        (emp.department?.toLowerCase().includes(q) ?? false) ||
        (emp.employee_id?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [employees, search]);

  const isFiltering = search.trim().length > 0;
  const countLabel = isFiltering
    ? `${filteredEmployees.length} of ${employees.length}`
    : `${employees.length} ${employees.length === 1 ? 'employee' : 'employees'}`;

  const refreshEmployees = useCallback(async () => {
    try {
      const data = await getOrgEmployees(organizationId);
      setEmployees(data);
    } catch (err) {
      logger.error({ err, organizationId }, 'Failed to refresh employees');
      toast({
        title: 'Could not refresh the list',
        description:
          'The import finished — reload the page to see the changes.',
        variant: 'destructive',
      });
    }
  }, [organizationId]);

  const existingEmails = useMemo(
    () =>
      new Set(
        employees
          .map((e) => e.email?.toLowerCase())
          .filter((e): e is string => !!e),
      ),
    [employees],
  );

  const openAdd = () => {
    setEditingEmployee(null);
    setIsFormOpen(true);
  };

  const openEdit = (employee: OrgEmployee) => {
    setEditingEmployee(employee);
    setIsFormOpen(true);
  };

  const handleSaved = (saved: OrgEmployee) => {
    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e.id === saved.id);
      if (idx === -1) return [...prev, saved];
      const next = [...prev];
      next[idx] = saved;
      return next;
    });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteOrgEmployee(pendingDelete.id);
      setEmployees((prev) => prev.filter((e) => e.id !== pendingDelete.id));
      toast({
        title: 'Employee deleted',
        description: `${pendingDelete.first_name} ${pendingDelete.last_name} has been removed from the directory.`,
      });
      setPendingDelete(null);
    } catch (err) {
      logger.error(
        { err, employeeId: pendingDelete.id },
        'Failed to delete employee',
      );
      toast({
        title: 'Error',
        description:
          err instanceof Error ? err.message : 'Failed to delete employee',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-10 text-sm"
            />
          </div>
          {employees.length > 0 && (
            <span className="text-sm text-muted-foreground">{countLabel}</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openAdd}>
            Add Employee
          </Button>
          {canImport && (
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[calc(100vh-2rem)] min-w-0 max-w-4xl grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
                <DialogHeader>
                  <DialogTitle>Import Employees</DialogTitle>
                  <DialogDescription>
                    Upload a CSV or Excel file and map its columns to PostSig
                    fields. Saved mappings are applied automatically on future
                    imports.
                  </DialogDescription>
                </DialogHeader>
                <ImportEmployees
                  savedMapping={importMapping}
                  orgGroups={orgGroups}
                  onImportComplete={() => {
                    setIsImportOpen(false);
                    refreshEmployees();
                  }}
                  onMappingSaved={setImportMapping}
                />
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <EmployeesTable
        employees={filteredEmployees}
        totalCount={employees.length}
        onView={setViewingEmployee}
        onEdit={openEdit}
        onDelete={setPendingDelete}
      />

      <ViewEmployeeDialog
        employee={viewingEmployee}
        open={!!viewingEmployee}
        onOpenChange={(open) => !open && setViewingEmployee(null)}
        onEdit={() => {
          if (!viewingEmployee) return;
          const target = viewingEmployee;
          setViewingEmployee(null);
          setEditingEmployee(target);
          setIsFormOpen(true);
        }}
      />

      <AddEmployeeDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        organizationId={organizationId}
        orgGroups={orgGroups}
        existingEmails={existingEmails}
        employee={editingEmployee ?? undefined}
        onSaved={handleSaved}
      />

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader className="min-w-0">
            <AlertDialogTitle>Delete employee?</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {pendingDelete && (
                <>
                  <span className="font-medium text-foreground">
                    {pendingDelete.first_name} {pendingDelete.last_name}
                  </span>{' '}
                  will be removed from the directory and hidden from contract
                  assignments. Their history is retained for audit purposes.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
