'use client';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { Check, ChevronDown } from 'lucide-react';
import { VendorProduct } from '@/constants/types';
import { FormErrors } from '@/app/hooks/useContractUsers';
import { useAbility } from '@/components/providers/AbilityProvider';
import { COUNTRIES_ALPHA3 } from '@/constants/countries';
import { useMemo, useState } from 'react';
import { PlusIcon } from '@radix-ui/react-icons';
import CreateBusinessGroupDialog from '@/components/settings/CreateBusinessGroupDialog';

interface UserManagementFormDialogProps {
  loading: boolean;
  newUser: {
    name: string;
    email: string;
    product_id: string;
    employee_id: string;
    region: string;
    country: string;
    division: string;
    department: string;
    cost_center: string;
    entity: string;
    business_unit: string;
    team: string;
    business_group_node_id: string;
    start_date: string;
    leave_date: string;
  };
  setNewUser: React.Dispatch<
    React.SetStateAction<UserManagementFormDialogProps['newUser']>
  >;
  errors: FormErrors;
  onAddUser: () => void;
  onClose: () => void;
  loadUsers: () => Promise<void>;
  vendorProducts?: VendorProduct[];
  orgGroups?: Array<{ id: number; name: string }>;
  disabled?: boolean;
  hideProductSelect?: boolean;
  onClearError?: (field: keyof FormErrors) => void;
  // Entity/Business Unit persist only on org_employees; disable when the
  // contract user has no linked employee record to write them to.
  disableOrgEmployeeFields?: boolean;
}

export function UserManagementFormDialog({
  loading,
  newUser,
  setNewUser,
  errors,
  onAddUser,
  onClose,
  vendorProducts = [],
  orgGroups = [],
  disabled = false,
  hideProductSelect = false,
  onClearError,
  disableOrgEmployeeFields = false,
}: UserManagementFormDialogProps) {
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState('');
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupInputValue, setGroupInputValue] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [createdGroups, setCreatedGroups] = useState<
    Array<{ id: number; name: string }>
  >([]);

  const ability = useAbility();
  const canManageUsers = ability.can('manage', 'ContractUser');
  const hasVendorProducts = vendorProducts && vendorProducts.length > 0;
  const formDisabled =
    disabled || !canManageUsers || (!hasVendorProducts && !hideProductSelect);

  const today = new Date().toISOString().split('T')[0];

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
    const pinnedItems = pinned
      .map((code) => filtered.find((c) => c.code === code))
      .filter(Boolean) as typeof filtered;
    const rest = filtered.filter((c) => !pinned.includes(c.code));
    return [...pinnedItems, ...rest];
  }, [countryQuery]);

  const sortedGroups = useMemo(() => {
    const byId = new Map<number, { id: number; name: string }>();
    for (const g of [...orgGroups, ...createdGroups]) byId.set(g.id, g);
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [orgGroups, createdGroups]);

  function handleGroupCreated(group: { id: number; name: string }) {
    setCreatedGroups((prev) => [...prev, group]);
    setNewUser((prev) => ({
      ...prev,
      business_group_node_id: String(group.id),
    }));
    setShowCreateGroup(false);
    setGroupsOpen(false);
    setGroupInputValue('');
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        {[...Array(1)].map((_, i) => (
          <div key={i} className="h-10 rounded-sm bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add User Form for Contract Owner Tab */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Name
          </p>
          <Input
            placeholder="Name"
            value={newUser.name}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, name: e.target.value }));
              onClearError?.('name');
            }}
            className={`h-8 text-sm ${errors.name ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-pink-600">{errors.name}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Email
          </p>
          <Input
            placeholder="Email"
            value={newUser.email}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, email: e.target.value }));
              onClearError?.('email');
            }}
            className={`h-8 text-sm ${errors.email ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-pink-600">{errors.email}</p>
          )}
        </div>
        {!hideProductSelect && (
          <div>
            <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
              Product
            </p>
            <Select
              value={newUser.product_id}
              onValueChange={(value) => {
                setNewUser((prev) => ({ ...prev, product_id: value }));
                onClearError?.('product_id');
              }}
              disabled={formDisabled}
              defaultValue="ALL_PRODUCTS"
            >
              <SelectTrigger
                className={`h-8 text-sm ${errors.product_id ? 'border-pink-600' : ''}`}
              >
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Select a product</SelectLabel>
                  <SelectSeparator />
                  <SelectItem value="ALL_PRODUCTS">All Products</SelectItem>
                  <SelectSeparator />
                  {Array.from(new Set(vendorProducts.map((p) => p.id)))
                    .map((id) => vendorProducts.find((p) => p.id === id))
                    .filter((p): p is VendorProduct => p !== undefined)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((product) => (
                      <SelectItem
                        key={product.id}
                        value={product.id.toString()}
                      >
                        {product.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            {errors.product_id && (
              <p className="text-xs text-pink-600">{errors.product_id}</p>
            )}
          </div>
        )}
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Employee ID
          </p>
          <Input
            placeholder="Employee ID"
            value={newUser.employee_id}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, employee_id: e.target.value }));
              onClearError?.('employee_id');
            }}
            className={`h-8 text-sm ${errors.employee_id ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.employee_id && (
            <p className="mt-1 text-xs text-pink-600">{errors.employee_id}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Region
          </p>
          <Input
            placeholder="Region"
            value={newUser.region}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, region: e.target.value }));
              onClearError?.('region');
            }}
            className={`h-8 text-sm ${errors.region ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.region && (
            <p className="mt-1 text-xs text-pink-600">{errors.region}</p>
          )}
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
                className={`font-normal h-8 w-full justify-between text-sm ${errors.country ? 'border-pink-600' : ''}`}
                disabled={formDisabled}
              >
                <span className="truncate">
                  {newUser.country
                    ? (COUNTRIES_ALPHA3.find((c) => c.code === newUser.country)
                        ?.name ?? newUser.country)
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
                          setNewUser((prev) => ({ ...prev, country: c.code }));
                          setCountryOpen(false);
                          setCountryQuery('');
                          onClearError?.('country');
                        }}
                        className="flex cursor-pointer items-start"
                      >
                        <span className="mr-2 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                          {newUser.country === c.code && (
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

          {errors.country && (
            <p className="mt-1 text-xs text-pink-600">{errors.country}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Division
          </p>
          <Input
            placeholder="Division"
            value={newUser.division}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, division: e.target.value }));
              onClearError?.('division');
            }}
            className={`h-8 text-sm ${errors.division ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.division && (
            <p className="mt-1 text-xs text-pink-600">{errors.division}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Department
          </p>
          <Input
            placeholder="Department"
            value={newUser.department}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, department: e.target.value }));
              onClearError?.('department');
            }}
            className={`h-8 text-sm ${errors.department ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.department && (
            <p className="mt-1 text-xs text-pink-600">{errors.department}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Cost Center
          </p>
          <Input
            placeholder="Cost Center"
            value={newUser.cost_center}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, cost_center: e.target.value }));
              onClearError?.('cost_center');
            }}
            className={`h-8 text-sm ${errors.cost_center ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.cost_center && (
            <p className="mt-1 text-xs text-pink-600">{errors.cost_center}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Entity
          </p>
          <Input
            placeholder="Entity"
            value={newUser.entity}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, entity: e.target.value }));
              onClearError?.('entity');
            }}
            className={`h-8 text-sm ${errors.entity ? 'border-pink-600' : ''}`}
            disabled={formDisabled || disableOrgEmployeeFields}
          />
          {errors.entity && (
            <p className="mt-1 text-xs text-pink-600">{errors.entity}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Business Unit
          </p>
          <Input
            placeholder="Business Unit"
            value={newUser.business_unit}
            onChange={(e) => {
              setNewUser((prev) => ({
                ...prev,
                business_unit: e.target.value,
              }));
              onClearError?.('business_unit');
            }}
            className={`h-8 text-sm ${errors.business_unit ? 'border-pink-600' : ''}`}
            disabled={formDisabled || disableOrgEmployeeFields}
          />
          {errors.business_unit && (
            <p className="mt-1 text-xs text-pink-600">{errors.business_unit}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Team
          </p>
          <Input
            placeholder="Team"
            value={newUser.team}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, team: e.target.value }));
              onClearError?.('team');
            }}
            className={`h-8 text-sm ${errors.team ? 'border-pink-600' : ''}`}
            disabled={formDisabled || disableOrgEmployeeFields}
          />
          {errors.team && (
            <p className="mt-1 text-xs text-pink-600">{errors.team}</p>
          )}
          {disableOrgEmployeeFields && (
            <p className="mt-1 text-xs text-muted-foreground">
              Entity, Business Unit, and Team are set on the linked employee
              record.
            </p>
          )}
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
                className={`font-normal h-8 w-full justify-between text-sm ${errors.business_group_node_id ? 'border-pink-600' : ''}`}
                // An unlinked seat has no org_employees row to carry the group.
                disabled={formDisabled || disableOrgEmployeeFields}
              >
                <span className="truncate">
                  {newUser.business_group_node_id
                    ? (sortedGroups.find(
                        (g) => String(g.id) === newUser.business_group_node_id,
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
                        setNewUser((prev) => ({
                          ...prev,
                          business_group_node_id: '',
                        }));
                        setGroupsOpen(false);
                        onClearError?.('business_group_node_id');
                      }}
                      className="cursor-pointer"
                    >
                      <span className="mr-2 flex h-4 w-4 items-center justify-center">
                        {!newUser.business_group_node_id && (
                          <Check className="h-4 w-4" />
                        )}
                      </span>
                      No group
                    </CommandItem>

                    {sortedGroups.length > 0 ? (
                      sortedGroups
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
                              setNewUser((prev) => ({
                                ...prev,
                                business_group_node_id: String(g.id),
                              }));
                              setGroupsOpen(false);
                              onClearError?.('business_group_node_id');
                            }}
                            className="cursor-pointer"
                          >
                            <span className="mr-2 flex h-4 w-4 items-center justify-center">
                              {newUser.business_group_node_id ===
                                String(g.id) && <Check className="h-4 w-4" />}
                            </span>
                            {g.name}
                          </CommandItem>
                        ))
                    ) : (
                      <CommandEmpty>No groups found.</CommandEmpty>
                    )}
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

          {errors.business_group_node_id && (
            <p className="mt-1 text-xs text-pink-600">
              {errors.business_group_node_id}
            </p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Start Date
          </p>
          <Input
            placeholder="Start Date"
            type="date"
            value={newUser.start_date}
            max={newUser.leave_date || today}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, start_date: e.target.value }));
              onClearError?.('start_date');
            }}
            className={`h-8 text-sm ${errors.start_date ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.start_date && (
            <p className="mt-1 text-xs text-pink-600">{errors.start_date}</p>
          )}
        </div>
        <div>
          <p className="mb-1 font-label text-xs uppercase tracking-wide text-muted-foreground">
            Leave Date
          </p>
          <Input
            placeholder="Leave Date"
            type="date"
            value={newUser.leave_date}
            min={newUser.start_date || undefined}
            onChange={(e) => {
              setNewUser((prev) => ({ ...prev, leave_date: e.target.value }));
              onClearError?.('leave_date');
            }}
            className={`h-8 text-sm ${errors.leave_date ? 'border-pink-600' : ''}`}
            disabled={formDisabled}
          />
          {errors.leave_date && (
            <p className="mt-1 text-xs text-pink-600">{errors.leave_date}</p>
          )}
        </div>
      </div>

      <div className="flex items-end justify-end gap-2">
        <Button
          size="sm"
          onClick={onClose}
          className="h-8 whitespace-nowrap px-3 text-sm"
          disabled={formDisabled}
          variant={'outline'}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onAddUser}
          className="h-8 whitespace-nowrap px-3 text-sm"
          disabled={formDisabled}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
