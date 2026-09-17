'use client';

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
} from 'react';

interface Folder {
  id: number;
  name: string;
  path: string;
  public_uuid: string;
  parent_id?: number | null;
  created_at?: string;
  user_id?: string;
}

interface FolderContextType {
  folderNameMap: Record<number, string>;
  folders: Folder[];
  organizationId: string;
  userId: string;
  addFolder: (folder: Folder) => void;
  removeFolder: (folderId: number) => void;
}

const FolderContext = createContext<FolderContextType>({
  folderNameMap: {},
  folders: [],
  organizationId: '',
  userId: '',
  addFolder: () => {},
  removeFolder: () => {},
});

export function FolderProvider({
  children,
  folderNameMap: initialFolderNameMap,
  folders: initialFolders,
  organizationId,
  userId,
}: {
  children: ReactNode;
  folderNameMap: Record<number, string>;
  folders: Folder[];
  organizationId: string;
  userId: string;
}) {
  const [folders, setFolders] = useState<Folder[]>(initialFolders);
  const [folderNameMap, setFolderNameMap] =
    useState<Record<number, string>>(initialFolderNameMap);

  // Update folders when initialFolders changes (after router.refresh())
  useEffect(() => {
    setFolders(initialFolders);
    setFolderNameMap(initialFolderNameMap);
  }, [initialFolders, initialFolderNameMap]);

  const addFolder = (folder: Folder) => {
    setFolders((prev) => [...prev, folder]);
    setFolderNameMap((prev) => ({ ...prev, [folder.id]: folder.name }));
  };

  const removeFolder = (folderId: number) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setFolderNameMap((prev) => {
      const next = { ...prev };
      delete next[folderId];
      return next;
    });
  };

  return (
    <FolderContext.Provider
      value={{
        folderNameMap,
        folders,
        organizationId,
        userId,
        addFolder,
        removeFolder,
      }}
    >
      {children}
    </FolderContext.Provider>
  );
}

export function useFolderContext() {
  return useContext(FolderContext);
}
