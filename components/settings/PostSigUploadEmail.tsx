'use client';

import Link from 'next/link';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  usePostsigEmailAddress,
  useTogglePostsigEmailAddress,
} from '@/hooks/api/usePostsigEmailAddress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAbility } from '@/components/providers/AbilityProvider';
import { PostSigEmailDisplay } from './PostSigEmailDisplay';

export function PostSigUploadEmail() {
  const { toast } = useToast();
  const ability = useAbility();
  const canUpdateOrgPreference = ability.can(
    'update',
    'OrganizationPreference',
  );
  const {
    data: postsigEmailAddressData,
    isLoading: isLoadingPostsigEmailAddress,
  } = usePostsigEmailAddress();
  const postsigEmailAddress = postsigEmailAddressData?.postsigEmailAddress;
  const enableOrgEmailAddress = postsigEmailAddressData?.preference;
  const togglePostsigEmailAddress = useTogglePostsigEmailAddress();

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
        description: `Email uploads ${enabled ? 'enabled' : 'disabled'} successfully`,
        variant: 'default',
      });
    } catch (error) {
      toast(
        generateToastError(
          error instanceof Error
            ? error.message
            : `Failed to ${enabled ? 'enable' : 'disable'}`,
          `Error ${enabled ? 'enabling' : 'disabling'} email uploads!`,
        ),
      );
    }
  };

  if (isLoadingPostsigEmailAddress) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (!postsigEmailAddress) {
    return (
      <p className="text-sm text-muted-foreground">
        No organization email address is available.
      </p>
    );
  }

  if (!enableOrgEmailAddress) {
    return (
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <label className="font-medium font-sans">
            Email documents to PostSig
          </label>
          <p className="text-sm text-muted-foreground">
            Enable this to be able to send your contracts to a designated
            PostSig email address for processing.
          </p>
        </div>
        <Switch
          checked={false}
          onCheckedChange={handleToggleEmailUploads}
          disabled={
            !canUpdateOrgPreference || togglePostsigEmailAddress.isPending
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PostSigEmailDisplay
        email={postsigEmailAddress}
        action={
          <Button
            variant="outline"
            size="sm"
            asChild
            className="h-10 rounded rounded-bl-none rounded-tl-none border-0"
          >
            <Link href="/settings/organization/upload-settings">Settings</Link>
          </Button>
        }
      />
      <p className="text-xs text-muted-foreground">
        Emails sent should not be more than 40mb in size. Up to 20 contracts can
        be sent at a time.
      </p>
    </div>
  );
}
