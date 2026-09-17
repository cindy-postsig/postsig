'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Can, useAbility } from '@/components/providers/AbilityProvider';
import { useVendorWhitelist } from '@/hooks/api/useVendorWhitelist';
import { VendorWhitelistTable } from './VendorWhitelistTable';
import { AddVendorForm } from './AddVendorForm';
import { VendorWhitelistCSVUpload } from './VendorWhitelistCSVUpload';
import { usePostsigEmailAddress } from '@/hooks/api/usePostsigEmailAddress';

export function VendorWhitelistSection() {
  const ability = useAbility();
  const canUpdate = ability.can('update', 'OrganizationPreference');

  const { data, isLoading, error } = useVendorWhitelist();
  const { data: postsigEmailAddressData } = usePostsigEmailAddress();
  const enableOrgEmailAddress = postsigEmailAddressData?.preference;
  const whitelist = data?.whitelist ?? [];

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vendor Whitelist</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            Failed to load vendor whitelist
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!enableOrgEmailAddress) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Vendor Whitelist</CardTitle>
          <p className="text-sm text-muted-foreground">
            Manage which vendors can send contracts to your PostSig email
            address. Add individual vendors or upload a CSV file.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <Can I="update" a="OrganizationPreference">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Add Vendor</h4>
              <AddVendorForm canUpdate={canUpdate} />
            </div>
            <Separator />
          </Can>
          <Can I="update" a="OrganizationPreference">
            <div className="space-y-4">
              <h4 className="font-medium text-sm">Bulk Import</h4>
              <VendorWhitelistCSVUpload
                canUpdate={canUpdate}
                currentCount={whitelist.length}
                existingEntries={whitelist.map((v) => v.email)}
              />
            </div>
          </Can>

          <Separator />

          <div className="space-y-4">
            <h4 className="font-medium text-sm">Current Whitelist</h4>
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-full max-w-sm" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <VendorWhitelistTable
                whitelist={whitelist}
                canUpdate={canUpdate}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
