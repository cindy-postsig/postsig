'use client';

import { Users } from 'lucide-react';
import { GroupedAccessSection } from './GroupedAccessSection';
import { type User } from '@/app/lib/sharing/actions';

interface AdminsManagersSectionProps {
  organizationName: string;
  adminsAndManagers: User[];
}

export function AdminsManagersSection({
  organizationName,
  adminsAndManagers,
}: AdminsManagersSectionProps) {
  return (
    <div>
      <GroupedAccessSection
        value="admins-managers"
        icon={<Users className="h-4 w-4" strokeWidth={1.5} />}
        title={
          <span className="space-x-2">
            <span className="font-medium">{organizationName}</span>
            <span className="text-muted-foreground">Admins</span>
          </span>
        }
        users={adminsAndManagers}
        helpText="Admins have access by default"
        className="w-full"
      />
    </div>
  );
}
