'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

interface DoraReportTabsProps {
  activeTab: string;
  ictCount?: number;
  otherCount?: number;
  ictContent?: React.ReactNode;
  otherContent?: React.ReactNode;
  onTabChange?: (tab: string) => void;
}

export function DoraReportTabs({
  activeTab,
  ictCount = 0,
  otherCount = 0,
  ictContent,
  otherContent,
  onTabChange,
}: DoraReportTabsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [currentTab, setCurrentTab] = useState(activeTab);

  // Update URL without page refresh when tab changes
  const handleTabChange = (value: string) => {
    setCurrentTab(value);

    // Call onTabChange if provided (for client-side filtering)
    if (onTabChange) {
      onTabChange(value);
    }

    // Update URL for bookmarking purposes, but don't trigger a navigation
    const newSearchParams = new URLSearchParams(searchParams.toString());

    if (value === 'ict') {
      newSearchParams.delete('tab');
    } else {
      newSearchParams.set('tab', value);
    }

    const newUrl = `${pathname}?${newSearchParams.toString()}`;
    router.push(newUrl, { scroll: false });
  };

  // If activeTab changes from outside (URL), sync internal state
  useEffect(() => {
    if (activeTab !== currentTab) {
      setCurrentTab(activeTab);
    }
  }, [activeTab]);

  // If we have content for both tabs, render them with TabsContent
  if (ictContent && otherContent) {
    return (
      <Tabs
        value={currentTab}
        onValueChange={handleTabChange}
        className="mb-6 w-full border-b"
      >
        <TabsList>
          <TabsTrigger value="ict">
            ICT Service Providers {ictCount > 0 && `(${ictCount})`}
          </TabsTrigger>
          <TabsTrigger value="other">
            Other Vendors {otherCount > 0 && `(${otherCount})`}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ict" className="m-0 mt-4">
          {ictContent}
        </TabsContent>
        <TabsContent value="other" className="m-0 mt-4">
          {otherContent}
        </TabsContent>
      </Tabs>
    );
  }

  // If no content is provided, just render tabs (old behavior)
  return (
    <Tabs
      value={currentTab}
      onValueChange={handleTabChange}
      className="mb-6 w-full border-b"
    >
      <TabsList className="-mb-[1px]">
        <TabsTrigger value="ict">
          ICT Service Providers {ictCount > 0 && `(${ictCount})`}
        </TabsTrigger>
        <TabsTrigger value="other">
          Other Vendors {otherCount > 0 && `(${otherCount})`}
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
