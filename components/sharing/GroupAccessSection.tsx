'use client';

import { Users, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { GroupedAccessSection } from './GroupedAccessSection';
import { useAbility } from '@/components/providers/AbilityProvider';

interface GroupMember {
  id: string;
  name: string;
  email: string;
}

interface Group {
  id: number;
  name: string;
  memberCount?: number;
  members?: GroupMember[];
}

interface GroupAccessSectionProps {
  groups: Group[];
  onRemoveGroup?: (groupId: number) => void;
}

export function GroupAccessSection({
  groups,
  onRemoveGroup,
}: GroupAccessSectionProps) {
  const ability = useAbility();
  const canManageGroups = ability.can('manage', 'Group');
  const groupsWithMembers = groups.filter((g) => (g.members || []).length > 0);

  if (groupsWithMembers.length === 0) return null;

  return (
    <>
      {groupsWithMembers.map((group) => (
        <div key={group.id} className="relative">
          <GroupedAccessSection
            value={`group-${group.id}`}
            icon={<Users className="h-4 w-4" strokeWidth={1.5} />}
            title={group.name}
            users={group.members || []}
            className="w-full pr-8 [&>svg]:hidden"
          />
          {onRemoveGroup && canManageGroups && (
            <div className="absolute right-1.5 top-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onRemoveGroup(group.id)}
                  >
                    Remove Access
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      ))}
    </>
  );
}
