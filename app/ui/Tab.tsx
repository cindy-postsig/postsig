'use client';
import React, { useState, useEffect, useRef } from 'react';
import { track } from '@vercel/analytics';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { useSearchParams } from 'next/navigation';

type Tab = {
  key: string;
  label: string;
  content: React.ReactNode;
  onClick?: () => void;
  indicator?: React.ReactNode;
};

type TabProps = {
  tabs: Tab[];
  defaultTab?: string;
  onViewChange?: (view: string) => void;
  footerComponent?: React.ReactNode;
  showFooterOnTab?: string;
  useUrlState?: boolean;
  urlParamName?: string;
  fullWidth?: boolean;
  // Horizontal padding applied when fullWidth (Tailwind class), e.g. 'px-8' | 'px-12'
  fullWidthPaddingX?: string;
  // Hide the built-in tab nav (e.g. when navigation is rendered elsewhere and
  // the active tab is driven purely by the URL param).
  hideTabList?: boolean;
  // 'top-0' for inner scroll containers, 'top-14' for body scroll with fixed header
  stickyTop?: 'top-0' | 'top-14';
};

const TabComponent: React.FC<TabProps> = ({
  tabs,
  defaultTab,
  onViewChange,
  footerComponent,
  showFooterOnTab,
  useUrlState = false,
  urlParamName = 'tab',
  fullWidth = false,
  fullWidthPaddingX = 'px-8',
  hideTabList = false,
  stickyTop = 'top-0',
}) => {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get(urlParamName);

  const isValidTabKey = tabParam && tabs.some((tab) => tab.key === tabParam);
  // A defaultTab naming a tab that is not rendered (e.g. ?view=lineage on a
  // contract without lineage content) must fall back too, or Radix selects
  // nothing and the panel renders blank.
  const isValidDefaultTab =
    defaultTab && tabs.some((tab) => tab.key === defaultTab);
  const initialTab = isValidTabKey
    ? tabParam
    : isValidDefaultTab
      ? defaultTab
      : tabs[0].key;

  const [activeTab, setActiveTab] = useState(initialTab);
  const activeTabRef = useRef(activeTab);
  // The param the selection was last taken from. A click writes the param
  // itself, so only a param that moved on its own — back/forward, or a link
  // into another tab — may override what is selected. Without this, entering
  // on a url that already names a tab pins every later render to that tab:
  // onViewChange re-renders the parent, the parent hands down a fresh `tabs`
  // array, and this effect re-applies the entry param over the click.
  const syncedTabParam = useRef(tabParam);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (tabParam !== syncedTabParam.current) {
      syncedTabParam.current = tabParam;
      if (isValidTabKey && tabParam) {
        setActiveTab(tabParam);
        onViewChange?.(tabParam);
        return;
      }
    }
    // Re-sync only a selection that no longer names a rendered tab (a
    // data-gated tab can disappear across client navigations); a valid
    // selection is kept — and reported to onViewChange as-is — so unstable
    // deps can't clobber a user's click or tell the parent a different tab
    // than the one shown.
    const resolved = tabs.some((tab) => tab.key === activeTabRef.current)
      ? activeTabRef.current
      : initialTab;
    setActiveTab(resolved);
    onViewChange?.(resolved);
  }, [isValidTabKey, tabParam, initialTab, onViewChange, tabs]);

  const handleValueChange = (value: string) => {
    setActiveTab(value);
    const selectedTab = tabs.find((tab) => tab.key === value);

    if (selectedTab) {
      track('Contract Tab: ' + selectedTab.label);
      onViewChange?.(value);

      if (useUrlState) {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set(urlParamName, value);

        // The native History API, not router.replace: the App Router syncs
        // useSearchParams from it without the RSC round trip a tab click
        // does not need. The state must be null — Next's patch skips that
        // sync for a payload already carrying its internals, which is what
        // passing window.history.state back in did; it copies them over
        // itself, so nothing is lost.
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}?${newParams.toString()}${window.location.hash}`,
        );
      }

      if (selectedTab.onClick) {
        selectedTab.onClick();
      }
    }
  };

  return (
    <Tabs
      value={activeTab}
      onValueChange={handleValueChange}
      className="flex min-h-0 w-full flex-col"
    >
      {/* Explicit class strings so Tailwind JIT can detect both variants */}
      {!hideTabList && (
        <div
          className={
            stickyTop === 'top-14'
              ? 'sticky top-14 z-10 border-b bg-background'
              : 'sticky top-0 z-10 border-b bg-background'
          }
        >
          <nav
            className={`flex h-10 gap-2 font-sans ${fullWidth ? fullWidthPaddingX : 'mx-auto max-w-7xl px-6'}`}
            aria-label="Tabs"
          >
            <TabsList className="h-10">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="-mb-[3px]"
                >
                  <span className="flex items-center gap-1.5">
                    {tab.label}
                    {tab.indicator}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>
        </div>
      )}

      {tabs.map((tab) => (
        <TabsContent
          key={tab.key}
          value={tab.key}
          className="mt-0 w-full bg-transparent pb-10 pt-6"
        >
          <Card className="w-full rounded-none border-0 bg-transparent p-0 shadow-none">
            <CardContent
              className={
                fullWidth
                  ? `w-full ${fullWidthPaddingX}`
                  : 'mx-auto w-full max-w-7xl'
              }
            >
              {tab.content}
            </CardContent>
            {footerComponent &&
              (!showFooterOnTab || activeTab === showFooterOnTab) && (
                <CardFooter className="w-full p-0">
                  <div className="w-full">{footerComponent}</div>
                </CardFooter>
              )}
          </Card>
        </TabsContent>
      ))}
    </Tabs>
  );
};

export default TabComponent;
