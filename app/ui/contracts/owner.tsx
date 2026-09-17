import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { MinusCircledIcon } from '@radix-ui/react-icons';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { VendorProduct, VendorProductUser } from '@/constants/types';
import { useAbility } from '@/components/providers/AbilityProvider';
import { useOwnersCatalog, useSaveContractOwners } from '@/hooks/api/useOwners';
import CreateBusinessGroupDialog from '@/components/settings/CreateBusinessGroupDialog';
import {
  GroupPicker,
  SponsorPicker,
  type SelectedGroup,
  type SelectedSponsor,
} from '@/components/contracts/OwnerPicker';
import { contractOwners } from '@/lib/v2/owners/embed';
import { sponsorRefKey, sponsorRefOf } from '@/lib/v2/owners/refs';
import type {
  ContractOwners,
  RawContractOwnerRow,
} from '@/lib/v2/owners/types';

type FormData = {
  justification: string;
  order: string;
};

type ContractType = {
  id: number;
  business_justification?: string | null;
  business_order?: string | null;
  contract_owners?: RawContractOwnerRow[] | null;
  vendor_products_users?: VendorProductUser[];
  vendor_products_details: {
    vendor_products: VendorProduct;
  }[];
};

const FIELDS = [
  { id: 'justification', label: 'Business Justification' },
  { id: 'order', label: 'Order #' },
] as const;

export default function ContractOwner({
  contract,
}: {
  contract: ContractType;
}) {
  const ability = useAbility();
  const canUpdateOwner = ability.can('update', 'Contract');
  const canManageOrganization = ability.can('manage', 'Organization');
  const { toast } = useToast();

  const owners = useMemo(() => contractOwners(contract), [contract]);
  const contractSponsors = useMemo(
    () =>
      owners.sponsors.map((sponsor) => ({
        ref: sponsorRefOf(sponsor),
        name: sponsor.name,
      })),
    [owners],
  );
  const contractGroups = useMemo(
    () => owners.groups.map((group) => ({ id: group.id, name: group.name })),
    [owners],
  );
  // A save is shown before the revalidated contract arrives; the next payload
  // (a different `owners`) supersedes it, so an owner changed elsewhere wins.
  const [pendingSave, setPendingSave] = useState<{
    basedOn: ContractOwners;
    sponsors: SelectedSponsor[];
    groups: SelectedGroup[];
  } | null>(null);
  const pending = pendingSave?.basedOn === owners ? pendingSave : null;
  const savedSponsors = pending?.sponsors ?? contractSponsors;
  const savedGroups = pending?.groups ?? contractGroups;

  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedData, setSavedData] = useState<FormData>({
    justification: contract.business_justification || '',
    order: contract.business_order || '',
  });
  const [formData, setFormData] = useState<FormData>(savedData);

  const [selectedSponsors, setSelectedSponsors] =
    useState<SelectedSponsor[]>(savedSponsors);
  const [selectedGroups, setSelectedGroups] =
    useState<SelectedGroup[]>(savedGroups);

  const [sponsorsOpen, setSponsorsOpen] = useState(false);
  const [sponsorQuery, setSponsorQuery] = useState('');
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groupQuery, setGroupQuery] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  // The catalog is org-wide and only needed once a picker is reached.
  const [catalogNeeded, setCatalogNeeded] = useState(false);
  const { data: catalog, isLoading: catalogLoading } =
    useOwnersCatalog(catalogNeeded);
  const { mutateAsync: saveOwners } = useSaveContractOwners(contract.id);

  function handleStartEditing() {
    setFormData(savedData);
    setSelectedSponsors([...savedSponsors]);
    setSelectedGroups([...savedGroups]);
    setCatalogNeeded(true);
    setIsEditing(true);
  }

  function handleCancel() {
    setFormData(savedData);
    setSelectedSponsors([...savedSponsors]);
    setSelectedGroups([...savedGroups]);
    setSponsorQuery('');
    setGroupQuery('');
    setSponsorsOpen(false);
    setGroupsOpen(false);
    setShowCreateGroup(false);
    setIsEditing(false);
  }

  function addSponsor(sponsor: SelectedSponsor) {
    if (sponsor.name === '') return;
    setSelectedSponsors((prev) =>
      prev.some((s) => sponsorRefKey(s.ref) === sponsorRefKey(sponsor.ref))
        ? prev
        : [...prev, sponsor],
    );
    setSponsorQuery('');
    setSponsorsOpen(false);
  }

  function removeSponsor(key: string) {
    setSelectedSponsors((prev) =>
      prev.filter((s) => sponsorRefKey(s.ref) !== key),
    );
  }

  function toggleGroup(group: SelectedGroup) {
    setSelectedGroups((prev) =>
      prev.some((g) => g.id === group.id)
        ? prev.filter((g) => g.id !== group.id)
        : [...prev, group],
    );
  }

  function removeGroup(groupId: number) {
    setSelectedGroups((prev) => prev.filter((g) => g.id !== groupId));
  }

  function handleGroupCreated(group: SelectedGroup) {
    setSelectedGroups((prev) =>
      prev.some((g) => g.id === group.id) ? prev : [...prev, group],
    );
    setShowCreateGroup(false);
    setGroupsOpen(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await saveOwners({
        sponsors: selectedSponsors.map((sponsor) => sponsor.ref),
        // Only an admin edits the groups; anyone else omits them so the
        // contract's own groups pass through untouched.
        ...(canManageOrganization
          ? { groupUnitIds: selectedGroups.map((group) => group.id) }
          : {}),
        justification: formData.justification || null,
        order: formData.order || null,
      });

      setSavedData(formData);
      setPendingSave({
        basedOn: owners,
        sponsors: [...selectedSponsors],
        groups: [...selectedGroups],
      });
      setIsEditing(false);
      toast({ title: 'Success', description: 'Saved successfully' });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Error saving changes',
        variant: 'destructive',
      });
    }

    setLoading(false);
  }

  const renderEmptyState = () => (
    <Card>
      <CardHeader>
        <CardTitle>Contract Owner</CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          onClick={handleStartEditing}
          variant="outline"
          className="text-sm"
          size={'sm'}
          disabled={!canUpdateOwner}
        >
          Add Contract Owner
        </Button>
      </CardContent>
    </Card>
  );

  const renderContractOwner = () => {
    // Show empty state only if there are no sponsors AND no business groups
    if (savedSponsors.length === 0 && savedGroups.length === 0 && !isEditing) {
      return renderEmptyState();
    }

    return (
      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex justify-between">
                Contract Owner
                {!isEditing && (
                  <Button
                    type="button"
                    variant="outline"
                    size={'sm'}
                    onClick={handleStartEditing}
                    disabled={!canUpdateOwner}
                  >
                    Edit
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>

          <CardContent>
            <div className="divide-y divide-foreground/10">
              {/* Sponsor field with dropdown */}
              <div className="grid grid-cols-4 gap-4 py-2">
                <div className="col-span-1 flex items-center font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                  Business Sponsor
                </div>
                <div className="col-span-3 min-h-7">
                  {isEditing ? (
                    <div className="space-y-2">
                      <SponsorPicker
                        open={sponsorsOpen}
                        onOpenChange={setSponsorsOpen}
                        users={catalog?.users ?? []}
                        employees={catalog?.employees ?? []}
                        isLoading={catalogLoading}
                        selected={selectedSponsors}
                        query={sponsorQuery}
                        onQueryChange={setSponsorQuery}
                        onAdd={addSponsor}
                      />

                      {selectedSponsors.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedSponsors.map((sponsor) => {
                            const key = sponsorRefKey(sponsor.ref);
                            return (
                              <div
                                key={key}
                                className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-sm"
                              >
                                {sponsor.name}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-4 w-4 p-0 hover:bg-transparent"
                                  onClick={() => removeSponsor(key)}
                                >
                                  <MinusCircledIcon className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="font-serif text-lg">
                      {savedSponsors.length > 0
                        ? savedSponsors.map((s) => s.name).join(', ')
                        : 'No sponsors'}
                    </div>
                  )}
                </div>
              </div>

              {/* Business Groups field with dropdown */}
              <div className="grid grid-cols-4 gap-4 py-2">
                <div className="col-span-1 flex items-center font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                  Business Groups
                </div>
                <div className="col-span-3 min-h-7">
                  {isEditing && canManageOrganization ? (
                    <div className="space-y-2">
                      <GroupPicker
                        open={groupsOpen}
                        onOpenChange={setGroupsOpen}
                        categories={catalog?.groups ?? []}
                        isLoading={catalogLoading}
                        selected={selectedGroups}
                        query={groupQuery}
                        onQueryChange={setGroupQuery}
                        onToggle={toggleGroup}
                        onCreateNew={() => {
                          setGroupsOpen(false);
                          setShowCreateGroup(true);
                        }}
                      />

                      <CreateBusinessGroupDialog
                        open={showCreateGroup}
                        onOpenChange={setShowCreateGroup}
                        onCreated={handleGroupCreated}
                      />

                      {selectedGroups.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {selectedGroups.map((group) => (
                            <div
                              key={group.id}
                              className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-sm"
                            >
                              {group.name}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-4 w-4 p-0 hover:bg-transparent"
                                onClick={() => removeGroup(group.id)}
                              >
                                <MinusCircledIcon className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="font-serif text-lg">
                      {savedGroups.length > 0
                        ? savedGroups.map((g) => g.name).join(', ')
                        : 'No groups'}
                    </div>
                  )}
                </div>
              </div>

              {/* Other fields */}
              {FIELDS.map(({ id, label }) => (
                <div key={id} className="grid grid-cols-4 gap-4 py-2">
                  <div className="col-span-1 flex items-center font-label text-[0.825rem] uppercase leading-tight tracking-wide text-foreground/85">
                    {label}
                  </div>
                  <div className="col-span-3 min-h-7">
                    {isEditing ? (
                      <Input
                        value={formData[id]}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            [id]: e.target.value,
                          }))
                        }
                        disabled={loading}
                        className="h-10 px-2 py-1 text-sm"
                      />
                    ) : (
                      <div className="font-serif text-lg">{savedData[id]}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {isEditing && (
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancel}
                  className="text-sm"
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading} className="text-sm">
                  {loading ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </form>
    );
  };

  return <div>{renderContractOwner()}</div>;
}
