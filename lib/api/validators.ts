import { UserMetadata } from '@/constants/types';

export function validateOrganization(userMetadata: UserMetadata): string {
  if (!userMetadata?.organizationId) {
    throw new Error('Organization not found');
  }
  return userMetadata.organizationId;
}
