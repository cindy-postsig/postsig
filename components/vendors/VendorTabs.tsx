'use client';

import type { ReactNode } from 'react';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const VENDOR_TABS = ['products', 'contracts', 'invoices', 'profile'] as const;
type VendorTab = (typeof VENDOR_TABS)[number];
const isVendorTab = (value: string): value is VendorTab =>
  (VENDOR_TABS as readonly string[]).includes(value);

export function VendorTabs({
  products,
  productCount,
  contracts,
  contractCount,
  invoices,
  invoiceCount,
  profile,
}: Omit<Record<VendorTab, ReactNode>, 'invoices'> & {
  /** Omitted when the org's Invoices module is disabled — hides the tab
   * entirely rather than showing it empty. */
  invoices?: ReactNode;
  productCount: number;
  contractCount: number;
  invoiceCount?: number;
}) {
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringLiteral(VENDOR_TABS).withDefault('products'),
  );

  return (
    <Tabs
      size="md"
      value={tab}
      onValueChange={(next) => {
        if (isVendorTab(next)) void setTab(next);
      }}
      className="w-full"
    >
      <TabsList className="w-full justify-start border-b">
        <TabsTrigger value="products">Products ({productCount})</TabsTrigger>
        <TabsTrigger value="contracts">Contracts ({contractCount})</TabsTrigger>
        {invoices !== undefined && (
          <TabsTrigger value="invoices">
            Invoices ({invoiceCount ?? 0})
          </TabsTrigger>
        )}
        <TabsTrigger value="profile">Profile</TabsTrigger>
      </TabsList>
      <TabsContent value="products" className="pt-6">
        {products}
      </TabsContent>
      <TabsContent value="contracts" className="pt-6">
        {contracts}
      </TabsContent>
      {invoices !== undefined && (
        <TabsContent value="invoices" className="pt-6">
          {invoices}
        </TabsContent>
      )}
      <TabsContent value="profile" className="pt-6">
        {profile}
      </TabsContent>
    </Tabs>
  );
}
