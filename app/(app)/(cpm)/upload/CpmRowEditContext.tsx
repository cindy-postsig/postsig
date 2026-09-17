'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
} from 'react';
import type { Dispatch, SetStateAction, ReactNode } from 'react';
import _ from 'lodash';
import { useUpdateContractFolders } from '@/hooks/api/useFolders';
import { useContract } from '@/hooks/api/useContract';
import { useOwnersCatalog, useSaveContractOwners } from '@/hooks/api/useOwners';
import { useUpdateContractTags } from '@/hooks/api/useTags';
import { useOrgFolders } from '@/hooks/api/useOrgFolders';
import { useOrgTags } from '@/hooks/api/useOrgTags';
import { useToast } from '@/components/ui/use-toast';
import { useAbility } from '@/components/providers/AbilityProvider';
import { contractOwners } from '@/lib/v2/owners/embed';
import { sponsorRefKey, sponsorRefOf } from '@/lib/v2/owners/refs';
import type { OwnerSponsorRef } from '@/lib/v2/owners/types';
import type { FieldSelectorItem } from '@/components/documents/FieldSelector';
import type { CpmUploadFile } from './CpmUploadPage';

const namesEqual = (a: FieldSelectorItem[], b: FieldSelectorItem[]) => {
  const aa = a.map((x) => x.name).sort();
  const bb = b.map((x) => x.name).sort();
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
};

const idsEqual = (a: FieldSelectorItem[], b: FieldSelectorItem[]) => {
  const aa = a.map((x) => String(x.id)).sort();
  const bb = b.map((x) => String(x.id)).sort();
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
};

interface CpmRowEditState {
  isEditing: boolean;
  isSaving: boolean;
  canUpdate: boolean;
  canManageOrganization: boolean;
  startEdit: () => void;
  save: () => Promise<void>;
  cancel: () => void;
  // Org data
  orgFolders: FieldSelectorItem[];
  isOrgFoldersLoading: boolean;
  orgUsers: FieldSelectorItem[];
  isOrgUsersLoading: boolean;
  orgBusinessGroups: FieldSelectorItem[];
  isOrgBusinessGroupsLoading: boolean;
  orgTags: FieldSelectorItem[];
  isOrgTagsLoading: boolean;
  // Saved data
  savedFolderData: FieldSelectorItem[];
  savedSponsorData: FieldSelectorItem[];
  savedGroupData: FieldSelectorItem[];
  savedTagData: FieldSelectorItem[];
  // Selected data
  selectedFolders: FieldSelectorItem[];
  setSelectedFolders: Dispatch<SetStateAction<FieldSelectorItem[]>>;
  selectedSponsors: FieldSelectorItem[];
  setSelectedSponsors: Dispatch<SetStateAction<FieldSelectorItem[]>>;
  selectedBusinessGroups: FieldSelectorItem[];
  setSelectedBusinessGroups: Dispatch<SetStateAction<FieldSelectorItem[]>>;
  selectedTags: FieldSelectorItem[];
  setSelectedTags: Dispatch<SetStateAction<FieldSelectorItem[]>>;
}

const CpmRowEditContext = createContext<CpmRowEditState | null>(null);

export function useCpmRowEdit(): CpmRowEditState {
  const ctx = useContext(CpmRowEditContext);
  if (!ctx) {
    throw new Error('useCpmRowEdit must be used within CpmRowEditProvider');
  }
  return ctx;
}

interface CpmRowEditProviderProps {
  file: CpmUploadFile;
  organizationId: string;
  children: ReactNode;
}

export function CpmRowEditProvider({
  file,
  organizationId,
  children,
}: CpmRowEditProviderProps) {
  const { toast } = useToast();
  const ability = useAbility();
  const canUpdate = ability.can('update', 'Contract');
  const canManageOrganization = ability.can('manage', 'Organization');

  const { data: orgFoldersData, isLoading: isOrgFoldersLoading } =
    useOrgFolders(organizationId);
  // Sponsors and business groups are contract owners: PostSig users and HR
  // employees, and business_group org units. Neither field touches ACL groups.
  const { data: ownersCatalog, isLoading: isOwnersCatalogLoading } =
    useOwnersCatalog(Boolean(organizationId));
  const { data: orgTagsData, isLoading: isOrgTagsLoading } =
    useOrgTags(organizationId);

  const orgSponsorOptions: FieldSelectorItem[] = useMemo(
    () => [
      ...(ownersCatalog?.users ?? []).map((user) => ({
        id: sponsorRefKey({ kind: 'user', id: user.id }),
        name: user.name,
      })),
      ...(ownersCatalog?.employees ?? []).map((employee) => ({
        id: sponsorRefKey({ kind: 'employee', id: employee.id }),
        name: employee.name,
      })),
    ],
    [ownersCatalog?.users, ownersCatalog?.employees],
  );

  const orgGroupOptions: FieldSelectorItem[] = useMemo(
    () =>
      (ownersCatalog?.groups ?? []).flatMap((category) =>
        category.items.map((item) => ({
          id: item.target.id,
          name: item.target.name,
        })),
      ),
    [ownersCatalog?.groups],
  );

  const { data: contractResponse, refetch: refetchContractData } = useContract(
    file.dbContractId || 0,
  );
  const contractData = contractResponse?.contract;

  // Selections
  const [selectedFolders, setSelectedFolders] = useState<FieldSelectorItem[]>(
    [],
  );
  const [selectedSponsors, setSelectedSponsors] = useState<FieldSelectorItem[]>(
    [],
  );
  const [selectedBusinessGroups, setSelectedBusinessGroups] = useState<
    FieldSelectorItem[]
  >([]);
  const [selectedTags, setSelectedTags] = useState<FieldSelectorItem[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Mutations
  const { mutateAsync: updateFolders } = useUpdateContractFolders();
  const { mutateAsync: saveOwners } = useSaveContractOwners(
    file.dbContractId || 0,
  );
  const { mutateAsync: updateTags } = useUpdateContractTags();

  // Saved data derived from contract
  const savedFolderData: FieldSelectorItem[] = useMemo(
    () =>
      _.get(contractData, 'folder_contracts', []).map(
        (fc: { folder_id: number; folders: { name: string } }) => ({
          id: fc.folder_id,
          name: fc.folders.name,
        }),
      ) || [],
    [contractData],
  );

  const savedOwners = useMemo(
    () => contractOwners(contractData ?? {}),
    [contractData],
  );

  const savedSponsorRefs: {
    key: string;
    ref: OwnerSponsorRef;
    name: string;
  }[] = useMemo(
    () =>
      savedOwners.sponsors.map((sponsor) => {
        const ref = sponsorRefOf(sponsor);
        return { key: sponsorRefKey(ref), ref, name: sponsor.name };
      }),
    [savedOwners],
  );

  const savedSponsorData: FieldSelectorItem[] = useMemo(
    () => savedSponsorRefs.map(({ key, name }) => ({ id: key, name })),
    [savedSponsorRefs],
  );

  const savedGroupData: FieldSelectorItem[] = useMemo(
    () =>
      savedOwners.groups.map((group) => ({ id: group.id, name: group.name })),
    [savedOwners],
  );

  // A selected sponsor carries only its key, so the ref it stands for comes
  // from the catalog; a saved bare label is in neither list and rebuilds from
  // its own name.
  const sponsorRefsByKey = useMemo(() => {
    const refs = new Map<string, OwnerSponsorRef>();
    for (const user of ownersCatalog?.users ?? []) {
      const ref: OwnerSponsorRef = { kind: 'user', id: user.id };
      refs.set(sponsorRefKey(ref), ref);
    }
    for (const employee of ownersCatalog?.employees ?? []) {
      const ref: OwnerSponsorRef = { kind: 'employee', id: employee.id };
      refs.set(sponsorRefKey(ref), ref);
    }
    for (const { key, ref } of savedSponsorRefs) refs.set(key, ref);
    return refs;
  }, [ownersCatalog?.users, ownersCatalog?.employees, savedSponsorRefs]);

  const savedTagData: FieldSelectorItem[] = useMemo(
    () =>
      _.get(contractData, 'contract_tags', []).map(
        (tag: { tag_id: number; user_tags: { name: string } }) => ({
          id: tag.tag_id,
          name: tag.user_tags.name,
        }),
      ) || [],
    [contractData],
  );

  const feedSelections = useCallback(() => {
    setSelectedFolders(savedFolderData);
    setSelectedSponsors(savedSponsorData);
    setSelectedBusinessGroups(savedGroupData);
    setSelectedTags(savedTagData);
  }, [savedFolderData, savedSponsorData, savedGroupData, savedTagData]);

  const clearSelections = useCallback(() => {
    setSelectedFolders([]);
    setSelectedSponsors([]);
    setSelectedBusinessGroups([]);
    setSelectedTags([]);
  }, []);

  const startEdit = useCallback(() => {
    setIsEditing(true);
    feedSelections();
  }, [feedSelections]);

  const cancel = useCallback(() => {
    setIsEditing(false);
    clearSelections();
  }, [clearSelections]);

  const save = useCallback(async () => {
    if (!file.dbContractId) return;

    setIsSaving(true);
    try {
      const folderChanged = !namesEqual(selectedFolders, savedFolderData);
      const tagsChanged = !namesEqual(selectedTags, savedTagData);
      const sponsorsChanged = !idsEqual(selectedSponsors, savedSponsorData);
      const groupsChanged =
        canManageOrganization &&
        !idsEqual(selectedBusinessGroups, savedGroupData);

      const updates: Promise<unknown>[] = [];

      if (folderChanged) {
        updates.push(
          updateFolders({
            contractId: file.dbContractId,
            folderIds: selectedFolders.length
              ? [Number(selectedFolders[0].id)]
              : [],
          }),
        );
      }
      if (sponsorsChanged || groupsChanged) {
        updates.push(
          saveOwners({
            sponsors: selectedSponsors.map(
              (sponsor) =>
                sponsorRefsByKey.get(String(sponsor.id)) ?? {
                  kind: 'label',
                  name: sponsor.name,
                },
            ),
            // Editing the groups is admin-only server side, so a sponsor-only
            // save omits them and passes the contract's own groups through.
            ...(groupsChanged
              ? {
                  groupUnitIds: selectedBusinessGroups.map((group) =>
                    Number(group.id),
                  ),
                }
              : {}),
          }),
        );
      }
      if (tagsChanged) {
        updates.push(
          updateTags({
            contractId: file.dbContractId,
            tagIds: selectedTags.map((t) => Number(t.id)),
          }),
        );
      }

      if (updates.length === 0) {
        toast({ title: 'No changes', description: 'Nothing to update.' });
        setIsEditing(false);
        return;
      }

      await Promise.all(updates);
      await refetchContractData();
      toast({
        title: 'Contract Updated',
        description: 'Contract metadata updated successfully.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description:
          (error instanceof Error ? error.message : String(error)) ||
          'An error occurred while updating contract metadata.',
      });
    } finally {
      setIsSaving(false);
      setIsEditing(false);
      clearSelections();
    }
  }, [
    file.dbContractId,
    selectedFolders,
    selectedSponsors,
    selectedBusinessGroups,
    canManageOrganization,
    selectedTags,
    savedFolderData,
    savedSponsorData,
    savedGroupData,
    savedTagData,
    sponsorRefsByKey,
    updateFolders,
    saveOwners,
    updateTags,
    refetchContractData,
    toast,
    clearSelections,
  ]);

  const value = useMemo<CpmRowEditState>(
    () => ({
      isEditing,
      isSaving,
      canUpdate,
      canManageOrganization,
      startEdit,
      save,
      cancel,
      orgFolders: orgFoldersData?.folders || [],
      isOrgFoldersLoading,
      orgUsers: orgSponsorOptions,
      isOrgUsersLoading: isOwnersCatalogLoading,
      orgBusinessGroups: orgGroupOptions,
      isOrgBusinessGroupsLoading: isOwnersCatalogLoading,
      orgTags: orgTagsData?.tags || [],
      isOrgTagsLoading,
      savedFolderData,
      savedSponsorData,
      savedGroupData,
      savedTagData,
      selectedFolders,
      setSelectedFolders,
      selectedSponsors,
      setSelectedSponsors,
      selectedBusinessGroups,
      setSelectedBusinessGroups,
      selectedTags,
      setSelectedTags,
    }),
    [
      isEditing,
      isSaving,
      canUpdate,
      canManageOrganization,
      startEdit,
      save,
      cancel,
      orgFoldersData?.folders,
      isOrgFoldersLoading,
      orgSponsorOptions,
      orgGroupOptions,
      isOwnersCatalogLoading,
      orgTagsData?.tags,
      isOrgTagsLoading,
      savedFolderData,
      savedSponsorData,
      savedGroupData,
      savedTagData,
      selectedFolders,
      selectedSponsors,
      selectedBusinessGroups,
      selectedTags,
    ],
  );

  return (
    <CpmRowEditContext.Provider value={value}>
      {children}
    </CpmRowEditContext.Provider>
  );
}
