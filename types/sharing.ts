/**
 * Shared types for folder and contract sharing functionality
 */

export interface SharingUser {
  id: string;
  name: string;
  email: string;
  perm: 'read' | 'write' | 'admin';
  role?: number;
  signedUp?: boolean;
}

export interface GroupMember {
  id: string;
  name: string;
  email: string;
}

export interface SharingGroup {
  id: number;
  name: string;
  perm: 'read' | 'write' | 'admin';
  memberCount?: number;
  publicUuid?: string;
  members?: GroupMember[];
}

export interface FolderACLData {
  folderId: number;
  folderName: string;
  folderPath: string;
  acl: {
    users: SharingUser[];
    groups: SharingGroup[];
  };
}

export interface ContractACLData {
  contractId: number;
  users: SharingUser[];
  groups: SharingGroup[];
}

export interface SharingProduct {
  vendor_products?: {
    name?: string;
  };
}

export type PermissionLevel = 'read' | 'write' | 'admin';
