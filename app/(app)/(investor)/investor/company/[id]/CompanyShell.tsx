'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import VendorIcon from '@/components/vendors/VendorIcon';
import { getVisibleCompanyTabItems, DEFAULT_COMPANY_TAB } from './companyTabs';
import {
  MissingDocsCountProvider,
  useMissingDocsCount,
} from './MissingDocsCountContext';
import { cn } from '@/lib/utils';

const NO_FUND = 'none';

export interface PanelCompany {
  id: string;
  name: string;
  domain?: string;
  funds: { id: number; name: string }[];
}

interface CompanyShellProps {
  companies: PanelCompany[];
  funds: { id: number; name: string }[];
  portcoKpisEnabled: boolean;
  children: React.ReactNode;
}

function CompaniesSidebar({
  companies,
  funds,
}: Pick<CompanyShellProps, 'companies' | 'funds'>) {
  const { open } = useSidebar();
  const { id: activeId } = useParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const [fundId, setFundId] = useState('all');
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);

  // Pull the active company into view only when it's off-screen — i.e. arriving
  // from another page. The shell lives in a static parent layout, so the list's
  // scroll survives company-to-company navigation and a clicked (visible) item
  // is left untouched.
  useEffect(() => {
    const container = scrollRef.current;
    const item = activeRef.current;
    if (!container || !item) return;
    const cRect = container.getBoundingClientRect();
    const iRect = item.getBoundingClientRect();
    if (iRect.top >= cRect.top && iRect.bottom <= cRect.bottom) return;
    container.scrollTop += iRect.top - cRect.top - 8;
  }, [activeId]);

  const hasFundlessCompanies = useMemo(
    () => companies.some((c) => c.funds.length === 0),
    [companies],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companies.filter((c) => {
      if (fundId === NO_FUND && c.funds.length > 0) {
        return false;
      }
      if (
        fundId !== 'all' &&
        fundId !== NO_FUND &&
        !c.funds.some((f) => String(f.id) === fundId)
      ) {
        return false;
      }
      return !q || c.name.toLowerCase().includes(q);
    });
  }, [companies, query, fundId]);

  return (
    <Sidebar
      collapsible="none"
      className={cn(
        'sticky top-14 h-[calc(100vh-3.5rem)] shrink-0 border-r transition-[width] duration-200 ease-linear',
        open ? 'w-[--sidebar-width]' : 'w-0 overflow-hidden border-0',
      )}
    >
      <SidebarHeader className="gap-2 border-b">
        <Input
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8"
        />
        <Select value={fundId} onValueChange={setFundId}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="All funds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All funds</SelectItem>
            {hasFundlessCompanies && (
              <SelectItem value={NO_FUND}>No fund</SelectItem>
            )}
            {funds.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SidebarHeader>
      <SidebarContent ref={scrollRef}>
        <SidebarMenu className="p-2">
          {filtered.map((c) => (
            <SidebarMenuItem
              key={c.id}
              ref={c.id === activeId ? activeRef : undefined}
            >
              <SidebarMenuButton asChild isActive={c.id === activeId}>
                <Link href={`/investor/company/${c.id}`} className="min-w-0">
                  <VendorIcon
                    name={c.name}
                    domain={c.domain}
                    width={20}
                    height={20}
                  />
                  <span className="min-w-0 truncate">{c.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
          {filtered.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No companies
            </p>
          )}
        </SidebarMenu>
      </SidebarContent>
    </Sidebar>
  );
}

export function CompanyShell({
  companies,
  funds,
  portcoKpisEnabled,
  children,
}: CompanyShellProps) {
  return (
    <MissingDocsCountProvider>
      <CompanyShellInner
        companies={companies}
        funds={funds}
        portcoKpisEnabled={portcoKpisEnabled}
      >
        {children}
      </CompanyShellInner>
    </MissingDocsCountProvider>
  );
}

function CompanyShellInner({
  companies,
  funds,
  portcoKpisEnabled,
  children,
}: CompanyShellProps) {
  const searchParams = useSearchParams();
  const activeView = searchParams.get('view') ?? DEFAULT_COMPANY_TAB;
  const { id: activeId } = useParams<{ id: string }>();
  const { count: missingDocsCount } = useMissingDocsCount();
  const tabItems = getVisibleCompanyTabItems(portcoKpisEnabled);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeId]);

  return (
    <SidebarProvider
      style={{ '--sidebar-width': '300px' } as React.CSSProperties}
      className="min-h-[calc(100vh-3.5rem)]"
    >
      <CompaniesSidebar companies={companies} funds={funds} />
      <div className="relative flex w-full min-w-0 flex-1 flex-col">
        <header className="sticky top-14 z-10 flex h-12 shrink-0 items-center gap-1 border-b bg-background px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <nav className="flex items-center gap-1">
            {tabItems.map((tab) => (
              <Button
                key={tab.key}
                asChild
                variant="ghost"
                size="sm"
                className={cn(
                  'font-normal px-3',
                  tab.key === activeView
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground',
                )}
              >
                <a
                  href={`?view=${tab.key}`}
                  aria-current={tab.key === activeView ? 'page' : undefined}
                  onClick={(e) => {
                    if (
                      e.metaKey ||
                      e.ctrlKey ||
                      e.shiftKey ||
                      e.button !== 0
                    ) {
                      return;
                    }
                    e.preventDefault();
                    const params = new URLSearchParams(window.location.search);
                    params.set('view', tab.key);
                    window.history.replaceState(null, '', `?${params}`);
                    window.scrollTo(0, 0);
                  }}
                >
                  {tab.label}
                  {tab.key === 'documents' && missingDocsCount > 0 && (
                    <span className="font-medium ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-700 text-xs text-primary-foreground">
                      {missingDocsCount}
                    </span>
                  )}
                </a>
              </Button>
            ))}
          </nav>
        </header>
        {children}
      </div>
    </SidebarProvider>
  );
}
