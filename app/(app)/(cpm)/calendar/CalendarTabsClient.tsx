'use client';

import type { ColumnSpec } from '@/components/contracts/columnLayout';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ContractsTableClient } from '@/components/contracts/ContractsTableClient';
import { dateTypeColorMap } from '@/app/lib/constants';
import { type ContractTableRow } from '@/lib/v2/core/types';
import { UserMetadata } from '@/constants/types';

type DateType = 'start' | 'end' | 'cancel';

interface CalendarTabsClientProps {
  startDateContracts: ContractTableRow[];
  endDateContracts: ContractTableRow[];
  cancelDateContracts: ContractTableRow[];
  columns: readonly ColumnSpec[];
  sort?: string;
  order?: 'asc' | 'desc';
  view: string;
  userMetadata: UserMetadata;
}

export function CalendarTabsClient({
  startDateContracts,
  endDateContracts,
  cancelDateContracts,
  columns,
  sort,
  order,
  view,
  userMetadata,
}: CalendarTabsClientProps) {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const tabs = [
    {
      value: 'expiring',
      type: 'end' as DateType,
      label: `Expiring this ${capitalize(view)}`,
      data: endDateContracts,
      defaultSort: sort || 'termEndDate',
    },
    {
      value: 'starting',
      type: 'start' as DateType,
      label: `Starting this ${capitalize(view)}`,
      data: startDateContracts,
      defaultSort: sort || 'termStartDate',
    },
    {
      value: 'cancel',
      type: 'cancel' as DateType,
      label: `Cancel this ${capitalize(view)}`,
      data: cancelDateContracts,
      defaultSort: sort || 'cancelByDate',
    },
  ].filter((tab) => tab.data.length > 0);

  const [selectedTab, setSelectedTab] = useState(tabs[0]?.value || 'expiring');

  // Reset to first available tab when tabs change
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((tab) => tab.value === selectedTab)) {
      setSelectedTab(tabs[0].value);
    }
  }, [tabs, selectedTab]);

  if (tabs.length === 0) {
    return (
      <div className="mt-8 text-center font-serif text-xl text-gray-700/60">
        No events this {view}
      </div>
    );
  }

  return (
    <Tabs
      value={selectedTab}
      onValueChange={setSelectedTab}
      className="mt-6 w-full"
    >
      <TabsList className="w-full justify-start border-b">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="-mb-[1px] gap-2"
          >
            <span>{tab.label}</span>
            <Badge variant="secondary" className="justify-center px-2 py-0">
              {tab.data.length}
            </Badge>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="mt-8">
          <ContractsTableClient
            data={tab.data}
            columns={columns}
            layoutKey="calendar.list"
            stickyHeader
            defaultSortColumn={tab.defaultSort}
            defaultSortDirection={order || 'asc'}
            userMetadata={userMetadata}
            hidePagination={false}
            itemsPerPage={50}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
