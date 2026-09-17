'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Plus } from 'lucide-react';
import { OrgTable } from './OrgTable';
import { VIEWER, ADMIN } from '@/constants/data';

interface GroupFolder {
  id: string;
  name: string;
  contractCount: number;
  description?: string;
}

interface GroupContract {
  id: string;
  vendorName: string;
  vendorDomain?: string;
  product: string;
  annualCost: number;
  currency: string;
}

interface GroupUser {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  addedAt: string;
}

interface BusinessGroup {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  folders: GroupFolder[];
  contracts: GroupContract[];
  users: GroupUser[];
}

interface ManageGroupDialogProps {
  group: BusinessGroup;
  trigger?: React.ReactNode;
}

export function ManageGroupDialog({ group, trigger }: ManageGroupDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Generate mock data for the selected group
  const mockFolders: GroupFolder[] = [
    {
      id: '1',
      name: 'Trading Systems',
      contractCount: 8,
      description: 'Core trading platform contracts',
    },
    {
      id: '2',
      name: 'Market Data Feeds',
      contractCount: 12,
      description: 'Real-time and historical market data',
    },
    {
      id: '3',
      name: 'Risk Management Tools',
      contractCount: 5,
      description: 'Risk analytics and compliance tools',
    },
  ];

  const mockContracts: GroupContract[] = [
    {
      id: '1',
      vendorName: 'Bloomberg L.P.',
      vendorDomain: 'bloomberg.com',
      product: 'Bloomberg Terminal',
      annualCost: 240000,
      currency: 'USD',
    },
    {
      id: '2',
      vendorName: 'London Stock Exchange Group',
      vendorDomain: 'lseg.com',
      product: 'Refinitiv Eikon',
      annualCost: 180000,
      currency: 'USD',
    },
  ];

  const mockUsers: GroupUser[] = [
    {
      id: '1',
      name: 'Sarah Chen',
      email: 'sarah.chen@company.com',
      role: ADMIN,
      addedAt: '2024-01-15T10:30:00Z',
    },
    {
      id: '2',
      name: 'Marcus Johnson',
      email: 'marcus.johnson@company.com',
      role: VIEWER,
      addedAt: '2024-01-20T14:20:00Z',
    },
    {
      id: '3',
      name: 'Lisa Rodriguez',
      email: 'lisa.rodriguez@company.com',
      role: VIEWER,
      addedAt: '2024-02-01T09:15:00Z',
    },
  ];

  const handleRevokeFolder = (folderId: string) => {
    // TODO: Implement folder revoke logic
    void folderId;
  };

  const handleRevokeContract = (contractId: string) => {
    // TODO: Implement contract revoke logic
    void contractId;
  };

  const handleRemoveUser = (userId: string) => {
    // TODO: Implement user removal logic
    void userId;
  };

  const handleAddUser = () => {
    // TODO: Implement add user logic
  };

  const columns = ['user', 'role', 'addedAt', 'actionsGroupUsers'];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm">
            Manage
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            Manage Group: {group.name}
            <Badge variant="secondary" className="font-normal">
              {group.memberCount}{' '}
              {group.memberCount === 1 ? 'member' : 'members'}
            </Badge>
          </DialogTitle>
          {group.description && (
            <p className="text-sm text-muted-foreground">{group.description}</p>
          )}
        </DialogHeader>

        <div className="space-y-8">
          {/* Folders Section */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium text-lg">
                Folders ({mockFolders.length})
              </h3>
            </div>
            <OrgTable
              data={mockFolders}
              columns={['folder', 'contractCount', 'actionsFolders']}
              onRemoveFolder={handleRevokeFolder}
              emptyStateMessage="No folders assigned"
            />
          </div>

          <Separator />

          {/* Contracts Section */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium text-lg">
                Contracts ({mockContracts.length})
              </h3>
            </div>
            <OrgTable
              data={mockContracts}
              columns={['vendor', 'annualCost', 'actionsContracts']}
              onRemoveContract={handleRevokeContract}
              emptyStateMessage="No contracts assigned"
            />
          </div>

          <Separator />

          {/* Users Section */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium text-lg">
                Users ({mockUsers.length})
              </h3>
              <Button size="sm" variant="outline" onClick={handleAddUser}>
                <Plus className="mr-2 h-4 w-4" />
                Add User
              </Button>
            </div>
            <OrgTable
              data={mockUsers}
              columns={columns}
              onRemoveUser={handleRemoveUser}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
