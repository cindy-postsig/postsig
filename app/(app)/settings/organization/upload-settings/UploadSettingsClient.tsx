'use client';

import { useState } from 'react';
import { UploadSettingsBreadcrumb } from './UploadSettingsBreadcrumb';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useAbility } from '@/components/providers/AbilityProvider';
import { useVendorWhitelist } from '@/hooks/api/useVendorWhitelist';
import { usePostsigEmailAddress } from '@/hooks/api/usePostsigEmailAddress';
import { PostSigEmailDisplay } from '@/components/settings/PostSigEmailDisplay';
import { AddVendorForm } from '@/components/settings/AddVendorForm';
import { VendorWhitelistCSVUpload } from '@/components/settings/VendorWhitelistCSVUpload';
import { VendorWhitelistTable } from '@/components/settings/VendorWhitelistTable';
import { useTogglePostsigEmailAddress } from '@/hooks/api/usePostsigEmailAddress';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { SettingsPage } from '@/components/settings/SettingsPage';

export function UploadSettingsClient() {
  const { toast } = useToast();
  const ability = useAbility();
  const canUpdate = ability.can('update', 'OrganizationPreference');
  const { data, isLoading, error } = useVendorWhitelist();
  const whitelist = data?.whitelist ?? [];
  const { data: emailData } = usePostsigEmailAddress();
  const postsigEmailAddress = emailData?.postsigEmailAddress;
  const isEnabled = emailData?.preference ?? false;
  const togglePostsigEmailAddress = useTogglePostsigEmailAddress();
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);

  const handleToggleEmailUploads = async (enabled: boolean) => {
    try {
      const preference = await togglePostsigEmailAddress.mutateAsync(enabled);
      if (preference?.preferenceValue === undefined) {
        toast(
          generateToastError(
            `Failed to ${enabled ? 'enable' : 'disable'} email uploads`,
            `Error ${enabled ? 'enabling' : 'disabling'} email uploads!`,
          ),
        );
        return;
      }
      toast({
        description: `Email uploads ${enabled ? 'enabled' : 'disabled'}`,
        variant: 'default',
      });
    } catch (err) {
      toast(
        generateToastError(
          err instanceof Error
            ? err.message
            : `Failed to ${enabled ? 'enable' : 'disable'}`,
          `Error ${enabled ? 'enabling' : 'disabling'} email uploads!`,
        ),
      );
    }
  };

  if (error) {
    return (
      <SettingsPage className="space-y-6">
        <UploadSettingsBreadcrumb />
        <div>
          <h3 className="font-medium">PostSig Upload Email</h3>
          <p className="text-sm text-muted-foreground">
            Manage vendor whitelist settings
          </p>
        </div>
        <Separator />
        <p className="text-sm text-destructive">
          Failed to load vendor whitelist
        </p>
      </SettingsPage>
    );
  }

  return (
    <SettingsPage className="space-y-6">
      <UploadSettingsBreadcrumb />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium flex items-center gap-2">
            PostSig Upload Email
            {!isEnabled && <Badge variant="secondary">Disabled</Badge>}
          </h3>
          <p className="text-sm text-muted-foreground">
            Manage vendor whitelist settings
          </p>
        </div>
        {canUpdate && (
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggleEmailUploads}
            disabled={togglePostsigEmailAddress.isPending}
          />
        )}
      </div>

      <div className="space-y-10">
        <Separator />

        {/* Upload Email Display */}
        {postsigEmailAddress && (
          <div>
            <Card>
              <CardContent className="space-y-4 p-5">
                <div className="flex flex-col gap-1">
                  <label className="font-medium flex items-center gap-2 font-sans">
                    Upload Email
                    {!isEnabled && (
                      <Badge variant="outline" className="font-normal">
                        Inactive
                      </Badge>
                    )}
                  </label>
                </div>
                <div className={!isEnabled ? 'opacity-50' : ''}>
                  <PostSigEmailDisplay
                    email={postsigEmailAddress}
                    disabled={!isEnabled}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {isEnabled
                    ? 'Emails sent should not be more than 40mb in size. Up to 20 contracts can be sent at a time.'
                    : 'Enable email uploads to use this address.'}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Add Vendor Section */}
        {canUpdate && (
          <div>
            <Card>
              <CardContent className="p-5">
                <div className="mb-6 flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="font-medium font-sans">
                      Add External Senders
                    </label>
                    <p className="text-sm text-muted-foreground">
                      Allow these email addresses or domains to send contracts
                      to your upload email.
                    </p>
                  </div>
                  <Dialog
                    open={isImportDialogOpen}
                    onOpenChange={setIsImportDialogOpen}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Import CSV
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Import Vendors</DialogTitle>
                        <DialogDescription>
                          CSV columns should include{' '}
                          <code className="rounded bg-muted px-1 font-label">
                            email
                          </code>{' '}
                          and optionally a{' '}
                          <code className="rounded bg-muted px-1 font-label">
                            vendor_name
                          </code>
                          .
                        </DialogDescription>
                      </DialogHeader>
                      <VendorWhitelistCSVUpload
                        canUpdate={canUpdate}
                        currentCount={whitelist.length}
                        existingEntries={whitelist.map((v) => v.email)}
                        onSuccess={() => setIsImportDialogOpen(false)}
                      />
                    </DialogContent>
                  </Dialog>
                </div>
                <AddVendorForm canUpdate={canUpdate} />
              </CardContent>
            </Card>
          </div>
        )}

        {/* Whitelisted Vendors Section */}
        <div>
          <h4 className="font-medium mb-4">
            Whitelisted Senders ({whitelist.length})
          </h4>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full max-w-sm" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <VendorWhitelistTable whitelist={whitelist} canUpdate={canUpdate} />
          )}
        </div>
      </div>
    </SettingsPage>
  );
}
