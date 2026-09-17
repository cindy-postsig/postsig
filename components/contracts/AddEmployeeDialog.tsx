'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Check, ChevronDown } from 'lucide-react';
import { PlusIcon } from '@radix-ui/react-icons';
import { COUNTRIES_ALPHA3 } from '@/constants/countries';
import { toast } from '@/components/ui/use-toast';
import {
  addOrgEmployee,
  updateOrgEmployee,
} from '@/data/superuser/org-employees';
import CreateBusinessGroupDialog from '@/components/settings/CreateBusinessGroupDialog';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  employeeSchema,
  todayIsoDate,
} from '@/lib/settings/employee-form';
import type { OrgEmployee } from '@/constants/types';
import logger from '@/utils/pino';

interface AddEmployeeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  orgGroups?: Array<{ id: number; name: string }>;
  existingEmails?: Set<string>;
  employee?: OrgEmployee;
  onSaved: (employee: OrgEmployee) => void;
}

type EmployeeStatus = 'active' | 'inactive' | 'on_leave';

type EmployeeFormErrors = Partial<Record<keyof typeof defaultForm, string>>;

const defaultForm = {
  first_name: '',
  last_name: '',
  email: '',
  employee_id: '',
  region: '',
  country: '',
  division: '',
  department: '',
  cost_center: '',
  business_unit: '',
  entity: '',
  team: '',
  business_group_node_id: '',
  start_date: '',
  leave_date: '',
  status: 'active' as EmployeeStatus,
};

function formFromEmployee(employee?: OrgEmployee): typeof defaultForm {
  if (!employee) return defaultForm;
  return {
    first_name: employee.first_name,
    last_name: employee.last_name,
    email: employee.email ?? '',
    employee_id: employee.employee_id ?? '',
    region: employee.region ?? '',
    country: employee.country ?? '',
    division: employee.division ?? '',
    department: employee.department ?? '',
    cost_center: employee.cost_center ?? '',
    business_unit: employee.business_unit ?? '',
    entity: employee.entity ?? '',
    team: employee.team ?? '',
    business_group_node_id: employee.businessGroup
      ? String(employee.businessGroup.id)
      : '',
    start_date: employee.start_date ?? '',
    leave_date: employee.leave_date ?? '',
    status: employee.status,
  };
}

export function AddEmployeeDialog({
  open,
  onOpenChange,
  organizationId,
  orgGroups = [],
  existingEmails,
  employee,
  onSaved,
}: AddEmployeeDialogProps) {
  const isEdit = !!employee;
  const [form, setForm] = useState(() => formFromEmployee(employee));
  const [errors, setErrors] = useState<EmployeeFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stashedLeaveDate, setStashedLeaveDate] = useState('');

  useEffect(() => {
    if (open) {
      setForm(formFromEmployee(employee));
      setErrors({});
      setStashedLeaveDate('');
    }
  }, [open, employee]);

  const handleStatusChange = (next: EmployeeStatus) => {
    if (
      next === 'active' &&
      form.leave_date &&
      form.leave_date < todayIsoDate()
    ) {
      setStashedLeaveDate(form.leave_date);
      setForm((prev) => ({ ...prev, status: next, leave_date: '' }));
      setErrors((prev) => {
        if (!prev.leave_date) return prev;
        const nextErrors = { ...prev };
        delete nextErrors.leave_date;
        return nextErrors;
      });
      return;
    }

    if (next !== 'active' && !form.leave_date && stashedLeaveDate) {
      setForm((prev) => ({
        ...prev,
        status: next,
        leave_date: stashedLeaveDate,
      }));
      setStashedLeaveDate('');
      return;
    }

    // Skip the default for future hires (start_date > today) — it would
    // violate the leave_date >= start_date validation
    if (
      next === 'inactive' &&
      !form.leave_date &&
      (!form.start_date || form.start_date <= todayIsoDate())
    ) {
      setForm((prev) => ({
        ...prev,
        status: next,
        leave_date: todayIsoDate(),
      }));
      return;
    }

    setForm((prev) => ({ ...prev, status: next }));
  };

  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupInputValue, setGroupInputValue] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  // A group created from this dialog is selected immediately, but `orgGroups`
  // only catches up after the server refresh, so hold it locally until then.
  const [createdGroups, setCreatedGroups] = useState<
    Array<{ id: number; name: string }>
  >([]);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    const filtered = q
      ? COUNTRIES_ALPHA3.filter(
          (c) =>
            c.code.toLowerCase().includes(q) ||
            c.name.toLowerCase().includes(q),
        )
      : COUNTRIES_ALPHA3;
    const pinned = ['USA', 'GBR'];
    const pinnedItems = pinned.flatMap((code) => {
      const found = filtered.find((c) => c.code === code);
      return found ? [found] : [];
    });
    const rest = filtered.filter((c) => !pinned.includes(c.code));
    return [...pinnedItems, ...rest];
  }, [countryQuery]);

  const sortedGroups = useMemo(() => {
    const byId = new Map(
      [...orgGroups, ...createdGroups].map((g) => [g.id, g] as const),
    );
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [orgGroups, createdGroups]);

  const update = (field: keyof typeof defaultForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const resetAndClose = () => {
    setForm(defaultForm);
    setErrors({});
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const parsed = employeeSchema.safeParse(form);
    if (!parsed.success) {
      const formErrors: EmployeeFormErrors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string') {
          formErrors[key as keyof EmployeeFormErrors] = issue.message;
        }
      }
      setErrors(formErrors);
      return;
    }

    const data = parsed.data;
    const trimmedEmail = data.email.trim().toLowerCase();
    const isOwnEmail =
      isEdit && employee?.email
        ? trimmedEmail === employee.email.toLowerCase()
        : false;
    if (trimmedEmail && !isOwnEmail && existingEmails?.has(trimmedEmail)) {
      setErrors({ email: 'An employee with this email already exists' });
      return;
    }

    const groupNodeIdNum = data.business_group_node_id
      ? Number(data.business_group_node_id)
      : NaN;
    const groupNodeIdValue = Number.isFinite(groupNodeIdNum)
      ? groupNodeIdNum
      : undefined;

    setIsSubmitting(true);
    try {
      let saved: OrgEmployee;
      if (isEdit && employee) {
        saved = await updateOrgEmployee({
          employeeId: employee.id,
          first_name: data.first_name,
          last_name: data.last_name,
          email: trimmedEmail || undefined,
          employee_id: data.employee_id || undefined,
          region: data.region || undefined,
          country: data.country || undefined,
          division: data.division || undefined,
          department: data.department || undefined,
          cost_center: data.cost_center || undefined,
          business_unit: data.business_unit || undefined,
          entity: data.entity || undefined,
          team: data.team || undefined,
          business_group_node_id: groupNodeIdValue ?? null,
          start_date: data.start_date || null,
          leave_date: data.leave_date || null,
          status: form.status,
        });

        toast({
          title: 'Employee updated',
          description: `${saved.first_name} ${saved.last_name} has been updated.`,
        });
      } else {
        saved = await addOrgEmployee({
          organizationId,
          first_name: data.first_name,
          last_name: data.last_name,
          email: trimmedEmail || undefined,
          employee_id: data.employee_id || undefined,
          region: data.region || undefined,
          country: data.country || undefined,
          division: data.division || undefined,
          department: data.department || undefined,
          cost_center: data.cost_center || undefined,
          business_unit: data.business_unit || undefined,
          entity: data.entity || undefined,
          team: data.team || undefined,
          business_group_node_id: groupNodeIdValue,
          start_date: data.start_date || undefined,
          leave_date: data.leave_date || undefined,
        });

        toast({
          title: 'Employee added',
          description: `${saved.first_name} ${saved.last_name} has been added to the directory.`,
        });
      }

      onSaved(saved);
      resetAndClose();
    } catch (err) {
      logger.error(
        { err, organizationId, isEdit },
        'Failed to save employee from dialog',
      );
      toast({
        title: 'Error',
        description:
          err instanceof Error
            ? err.message
            : isEdit
              ? 'Failed to update employee.'
              : 'Failed to add employee. The email may already be in use.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  function handleGroupCreated(group: { id: number; name: string }) {
    setCreatedGroups((prev) =>
      prev.some((g) => g.id === group.id) ? prev : [...prev, group],
    );
    update('business_group_node_id', String(group.id));
    setShowCreateGroup(false);
    setGroupsOpen(false);
    setGroupInputValue('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(v) : resetAndClose())}
    >
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pb-4 pr-12 pt-5">
          <DialogTitle>
            {isEdit ? 'Edit Employee' : 'Add Employee to Directory'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 gap-x-8 gap-y-3 overflow-y-auto px-6 pb-8 pt-5 sm:grid-flow-col sm:grid-cols-2 sm:grid-rows-[repeat(8,auto)] [&>div>p:first-child]:mb-0 [&>div>p:first-child]:mt-2 [&>div>p:not(:first-child)]:col-start-2 [&>div]:grid [&>div]:grid-cols-[7rem_minmax(0,1fr)] [&>div]:items-start [&>div]:gap-x-3">
          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              First Name
            </p>
            <Input
              placeholder="First Name"
              value={form.first_name}
              maxLength={NAME_MAX_LENGTH}
              onChange={(e) => update('first_name', e.target.value)}
              className={`h-8 text-sm ${errors.first_name ? 'border-pink-600' : ''}`}
            />
            {errors.first_name && (
              <p className="mt-1 text-xs text-pink-600">{errors.first_name}</p>
            )}
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Last Name
            </p>
            <Input
              placeholder="Last Name"
              value={form.last_name}
              maxLength={NAME_MAX_LENGTH}
              onChange={(e) => update('last_name', e.target.value)}
              className={`h-8 text-sm ${errors.last_name ? 'border-pink-600' : ''}`}
            />
            {errors.last_name && (
              <p className="mt-1 text-xs text-pink-600">{errors.last_name}</p>
            )}
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Email
            </p>
            <Input
              placeholder="Email"
              value={form.email}
              maxLength={EMAIL_MAX_LENGTH}
              onChange={(e) => update('email', e.target.value)}
              className={`h-8 text-sm ${errors.email ? 'border-pink-600' : ''}`}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-pink-600">{errors.email}</p>
            )}
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Employee ID
            </p>
            <Input
              placeholder="Employee ID"
              value={form.employee_id}
              onChange={(e) => update('employee_id', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Country
            </p>
            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={countryOpen}
                  className="font-normal h-8 w-full justify-between text-sm"
                >
                  <span className="truncate">
                    {form.country
                      ? (COUNTRIES_ALPHA3.find((c) => c.code === form.country)
                          ?.name ?? form.country)
                      : 'Select country'}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search country..."
                    value={countryQuery}
                    onValueChange={setCountryQuery}
                    className="pl-1"
                  />
                  <CommandList className="max-h-60">
                    <CommandEmpty>No country found.</CommandEmpty>
                    <CommandGroup heading="Country">
                      {filteredCountries.map((c) => (
                        <CommandItem
                          key={c.code}
                          value={`${c.code} ${c.name}`}
                          onSelect={() => {
                            update('country', c.code);
                            setCountryOpen(false);
                            setCountryQuery('');
                          }}
                          className="flex cursor-pointer items-start"
                        >
                          <span className="mr-2 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                            {form.country === c.code && (
                              <Check className="h-4 w-4" />
                            )}
                          </span>
                          <span className="font-medium w-8 shrink-0 font-mono text-xs leading-5">
                            {c.code}
                          </span>
                          <span className="text-sm leading-5">{c.name}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Region
            </p>
            <Input
              placeholder="Region"
              value={form.region}
              onChange={(e) => update('region', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Entity
            </p>
            <Input
              placeholder="Entity"
              value={form.entity}
              onChange={(e) => update('entity', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Business Group
            </p>
            <Popover open={groupsOpen} onOpenChange={setGroupsOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={groupsOpen}
                  className="font-normal h-8 w-full justify-between text-sm"
                >
                  <span className="truncate">
                    {form.business_group_node_id
                      ? (sortedGroups.find(
                          (g) => String(g.id) === form.business_group_node_id,
                        )?.name ?? 'Loading...')
                      : 'Select group'}
                  </span>
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[320px] p-0" align="start">
                <Command>
                  <CommandInput
                    placeholder="Search groups..."
                    value={groupInputValue}
                    onValueChange={setGroupInputValue}
                    className="pl-1"
                  />
                  <CommandList className="max-h-60">
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setGroupsOpen(false);
                          setShowCreateGroup(true);
                        }}
                        className="cursor-pointer"
                      >
                        <PlusIcon className="mr-2 h-4 w-4" />
                        Create new group...
                      </CommandItem>
                    </CommandGroup>

                    <CommandSeparator />

                    <CommandGroup heading="Business Groups">
                      <CommandItem
                        onSelect={() => {
                          update('business_group_node_id', '');
                          setGroupsOpen(false);
                        }}
                        className="cursor-pointer"
                      >
                        <span className="mr-2 flex h-4 w-4 items-center justify-center">
                          {!form.business_group_node_id && (
                            <Check className="h-4 w-4" />
                          )}
                        </span>
                        No group
                      </CommandItem>

                      {sortedGroups
                        .filter(
                          (g) =>
                            groupInputValue === '' ||
                            g.name
                              .toLowerCase()
                              .includes(groupInputValue.toLowerCase()),
                        )
                        .map((g) => (
                          <CommandItem
                            key={g.id}
                            onSelect={() => {
                              update('business_group_node_id', String(g.id));
                              setGroupsOpen(false);
                            }}
                            className="cursor-pointer"
                          >
                            <span className="mr-2 flex h-4 w-4 items-center justify-center">
                              {form.business_group_node_id === String(g.id) && (
                                <Check className="h-4 w-4" />
                              )}
                            </span>
                            {g.name}
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <CreateBusinessGroupDialog
              open={showCreateGroup}
              onOpenChange={setShowCreateGroup}
              onCreated={handleGroupCreated}
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Division
            </p>
            <Input
              placeholder="Division"
              value={form.division}
              onChange={(e) => update('division', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Business Unit
            </p>
            <Input
              placeholder="Business Unit"
              value={form.business_unit}
              onChange={(e) => update('business_unit', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Department
            </p>
            <Input
              placeholder="Department"
              value={form.department}
              onChange={(e) => update('department', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Team
            </p>
            <Input
              placeholder="Team"
              value={form.team}
              onChange={(e) => update('team', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Cost Center
            </p>
            <Input
              placeholder="Cost Center"
              value={form.cost_center}
              onChange={(e) => update('cost_center', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Start Date
            </p>
            <Input
              placeholder="Start Date"
              type="date"
              value={form.start_date}
              max={form.leave_date || undefined}
              onChange={(e) => update('start_date', e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Leave Date
            </p>
            <Input
              placeholder="Leave Date"
              type="date"
              value={form.leave_date}
              min={form.start_date || undefined}
              onChange={(e) => {
                update('leave_date', e.target.value);
                setStashedLeaveDate('');
              }}
              className={`h-8 text-sm ${errors.leave_date ? 'border-pink-600' : ''}`}
            />
            {errors.leave_date && (
              <p className="mt-1 text-xs text-pink-600">{errors.leave_date}</p>
            )}
          </div>

          {isEdit && (
            <div>
              <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
                Status
              </p>
              <Select
                value={form.status}
                onValueChange={(v) => handleStatusChange(v as EmployeeStatus)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_leave">On Leave</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t bg-background px-6 py-4">
          <Button
            size="sm"
            variant="outline"
            onClick={resetAndClose}
            className="h-8 px-3 text-sm"
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            className="h-8 px-3 text-sm"
            disabled={isSubmitting}
          >
            {isSubmitting
              ? isEdit
                ? 'Saving...'
                : 'Adding...'
              : isEdit
                ? 'Save Changes'
                : 'Add Employee'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
