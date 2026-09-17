type PermissionLevel = 'read' | 'write' | 'admin';

export interface ACL {
  users: Array<{
    id: string;
    name: string;
    email: string;
    perm: PermissionLevel;
    signedUp?: boolean;
  }>;
  groups: Array<{
    id: number;
    name: string;
    perm: PermissionLevel;
    memberCount?: number;
    publicUuid?: string;
    members?: Array<{ id: string; name: string; email: string }>;
  }>;
}

/**
 * User info needed to ensure they're included in an ACL.
 * The perm field is optional as it will default to 'read'.
 */
export interface UploaderInfo {
  id: string;
  name: string;
  email: string;
  signedUp?: boolean;
}

/**
 * Ensures the uploader is included in the ACL users list.
 * The uploader may not be in contract_acl_user table, but should always have read access.
 */
export function ensureUploaderInACL(acl: ACL, uploader?: UploaderInfo): ACL {
  if (!uploader) return acl;

  const uploaderId = uploader.id;
  const uploaderInList = acl.users.some((u) => u.id === uploaderId);

  if (uploaderInList) return acl;

  // Add uploader to the beginning of the users list
  return {
    ...acl,
    users: [
      {
        id: uploader.id,
        name: uploader.name,
        email: uploader.email || '',
        perm: 'read' as PermissionLevel,
        signedUp: uploader.signedUp,
      },
      ...acl.users,
    ],
  };
}
