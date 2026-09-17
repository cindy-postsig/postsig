'use client';

import { useState } from 'react';
import { updateOrganizationUser } from '@/app/lib/actions/organization-users';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { RoleSelector } from '@/components/settings/RoleSelector';
import { UserRole } from '@/constants/types';

interface UserRoleSelectorProps {
  userId: string;
  currentRole: UserRole;
}

export function UserRoleSelector({
  userId,
  currentRole,
}: UserRoleSelectorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);

  const handleRoleChange = async (newRole: string) => {
    setIsUpdating(true);
    try {
      await updateOrganizationUser(userId, {
        appRole: newRole as UserRole,
      });
      toast({
        title: 'Success',
        description: 'User role updated successfully',
      });
      router.refresh();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update user role',
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <RoleSelector
      value={currentRole}
      onValueChange={handleRoleChange}
      disabled={isUpdating}
      className="font-normal w-36 justify-between text-sm"
    />
  );
}
