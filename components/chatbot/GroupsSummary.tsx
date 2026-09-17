'use client';

import type {
  GroupsToolOutput,
  GroupResult,
  OrgGroupsResult,
  VendorGroupsResult,
  PermissionLevel,
} from '@/lib/v2/chat/client';
import {
  isToolError,
  createContractPermissionColumns,
} from '@/lib/v2/chat/client';
import {
  DataTable,
  type ColumnConfig,
} from '@/components/chatbot/GenericDataTable';
import { PermissionBadge } from '@/components/chatbot/PermissionBadge';
import { Users, Building2, Shield } from 'lucide-react';

// =============================================================================
// ROW TYPES
// =============================================================================

interface OrgGroupRow extends Record<string, unknown> {
  id: number;
  name: string;
  memberCount: number;
  contractCount: number;
}

interface GroupContractRow extends Record<string, unknown> {
  contractId: number;
  vendorName: string;
  contractType: string;
  permission: PermissionLevel;
}

interface VendorGroupRow extends Record<string, unknown> {
  id: number;
  name: string;
  permission: PermissionLevel;
}

// =============================================================================
// COLUMN DEFINITIONS
// =============================================================================

const orgGroupColumns: ColumnConfig<OrgGroupRow>[] = [
  {
    key: 'name',
    header: 'Group Name',
    render: (value) => <span className="font-medium">{value as string}</span>,
  },
  {
    key: 'memberCount',
    header: 'Members',
    render: (value) => (
      <div className="flex items-center gap-1">
        <Users className="h-3 w-3 text-muted-foreground" />
        <span>{value as number}</span>
      </div>
    ),
    className: 'text-center',
    headerClassName: 'text-center',
  },
  {
    key: 'contractCount',
    header: 'Contracts',
    render: (value) => <span className="font-medium">{value as number}</span>,
    className: 'text-center',
    headerClassName: 'text-center',
  },
];

const groupContractColumns: ColumnConfig<GroupContractRow>[] =
  createContractPermissionColumns<GroupContractRow>();

const vendorGroupColumns: ColumnConfig<VendorGroupRow>[] = [
  {
    key: 'name',
    header: 'Group Name',
    render: (value) => <span className="font-medium">{value as string}</span>,
  },
  {
    key: 'permission',
    header: 'Permission',
    render: (value) => <PermissionBadge level={value as PermissionLevel} />,
    className: 'text-center',
    headerClassName: 'text-center',
  },
];

// =============================================================================
// SUMMARY COMPONENTS
// =============================================================================

function OrgGroupsSummary({ data }: { data: OrgGroupsResult }) {
  const rows: OrgGroupRow[] = data.groups.map((g) => ({
    id: g.id,
    name: g.name,
    memberCount: g.memberCount,
    contractCount: g.contractCount,
  }));

  return (
    <DataTable
      data={rows}
      columns={orgGroupColumns}
      title="Organization Groups"
      icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
      showExport={true}
      exportFilename="organization-groups"
      scrollAreaClassName="max-h-[300px] overflow-y-auto"
      striped={true}
      className="my-2"
    />
  );
}

function GroupContractsSummary({ data }: { data: GroupResult }) {
  const rows: GroupContractRow[] = data.contracts.map((c) => ({
    contractId: c.contractId,
    vendorName: c.vendorName || '-',
    contractType: c.contractType || '-',
    permission: c.permission,
  }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        <span>{data.memberCount} members</span>
        <span className="text-muted-foreground/40">|</span>
        <span>{data.contractCount} contracts</span>
      </div>
      <DataTable
        data={rows}
        columns={groupContractColumns}
        title={data.groupName}
        icon={<Shield className="h-4 w-4 text-muted-foreground" />}
        showExport={true}
        exportFilename={`${data.groupName.replace(/\s+/g, '-').toLowerCase()}-contracts`}
        scrollAreaClassName="max-h-[300px] overflow-y-auto"
        striped={true}
        className="my-2"
      />
    </div>
  );
}

function VendorGroupsSummary({ data }: { data: VendorGroupsResult }) {
  const rows: VendorGroupRow[] = data.groups.map((g) => ({
    id: g.id,
    name: g.name,
    permission: g.permission,
  }));

  if (rows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No groups have access to {data.vendorName} contracts.
      </p>
    );
  }

  return (
    <DataTable
      data={rows}
      columns={vendorGroupColumns}
      title={`Groups with ${data.vendorName} Access`}
      icon={<Shield className="h-4 w-4 text-muted-foreground" />}
      showExport={true}
      exportFilename={`${data.vendorName.replace(/\s+/g, '-').toLowerCase()}-groups`}
      scrollAreaClassName="max-h-[300px] overflow-y-auto"
      striped={true}
      className="my-2"
    />
  );
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

export function GroupsSummary({ data }: { data: GroupsToolOutput }) {
  if (isToolError(data)) {
    if (data.error === '_NO_RESULTS_') {
      return null;
    }
    return (
      <p className="text-xs text-red-600 dark:text-red-400">{data.error}</p>
    );
  }

  switch (data.type) {
    case 'org_groups':
      return <OrgGroupsSummary data={data} />;
    case 'group_contracts':
      return <GroupContractsSummary data={data} />;
    case 'vendor_groups':
      return <VendorGroupsSummary data={data} />;
    default:
      return null;
  }
}

export function GroupsSummaryLoading() {
  return (
    <div className="animate-pulse space-y-1.5">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-3 w-48 rounded bg-muted" />
    </div>
  );
}
