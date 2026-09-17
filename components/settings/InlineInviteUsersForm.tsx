'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusIcon } from '@radix-ui/react-icons';
import { Trash2 } from 'lucide-react';
import { createOrganizationUser } from '@/app/lib/actions/organization-users';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/use-toast';
import { validateEmailDomain, isValidEmail } from '@/app/lib/validations';
import logger from '@/utils/pino';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import { RoleSelector } from './RoleSelector';
import { UserRoleWithoutOld } from '@/constants/types';
import { useSharingDialog } from '@/app/(app)/SharingDialogContext';

interface UserInvite {
  id: string;
  fullName: string;
  email: string;
  role: UserRoleWithoutOld | '';
  domainError?: boolean;
}

const MAX_INVITES = 10;

export default function InlineInviteUsersForm({
  userEmail,
  moduleId,
}: {
  userEmail: string;
  moduleId?: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { refreshOrgData } = useSharingDialog();
  const [invites, setInvites] = useState<UserInvite[]>([
    { id: '1', fullName: '', email: '', role: '' },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const orgDomain = userEmail.split('@')[1]?.toLowerCase();

  useEffect(() => {
    if (!orgDomain) {
      logger.error(
        { userEmail: sanitizeForLogging(userEmail) },
        'Unable to determine organization domain for invite form',
      );
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Unable to determine organization domain for invite form',
      });
    }
  }, [orgDomain, userEmail, toast]);

  const addInvite = () => {
    if (invites.length >= MAX_INVITES) {
      toast({
        variant: 'destructive',
        title: 'Limit Reached',
        description: `You can only invite up to ${MAX_INVITES} users at once`,
      });
      return;
    }
    const newId = crypto.randomUUID();
    setInvites((prev) => [
      ...prev,
      { id: newId, fullName: '', email: '', role: '' },
    ]);
  };

  const updateInvite = (
    id: string,
    field: 'fullName' | 'email' | 'role',
    value: string,
  ) => {
    setInvites(
      invites.map((invite) => {
        if (invite.id !== id) return invite;

        const updated = { ...invite, [field]: value };

        // Clear error when typing, don't validate yet
        if (field === 'email' && invite.domainError) {
          updated.domainError = false;
        }

        return updated;
      }),
    );
  };

  const validateEmailOnBlur = (id: string, email: string) => {
    setInvites(
      invites.map((invite) => {
        if (invite.id !== id) return invite;

        const updated = { ...invite };
        // Only validate if email has @ symbol
        if (email.includes('@')) {
          updated.domainError = !validateEmailDomain(email, orgDomain);
        }

        return updated;
      }),
    );
  };

  const removeInvite = (id: string) => {
    setInvites((prev) =>
      prev.length === 1
        ? [{ id: '1', fullName: '', email: '', role: '' }]
        : prev.filter((invite) => invite.id !== id),
    );
  };

  const handleSubmit = async () => {
    const trimmed = invites.map((inv) => ({ ...inv, email: inv.email.trim() }));
    const invalidEmails = trimmed.filter(
      (inv) => inv.email && !isValidEmail(inv.email),
    );
    if (invalidEmails.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid email',
        description: 'Please enter valid email addresses',
      });
      return;
    }
    const domainErrors = trimmed.filter((inv) => inv.domainError);

    if (domainErrors.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Domain Mismatch',
        description: `All invited users must have an @${orgDomain} email address`,
      });
      return;
    }

    const validInvites = trimmed.filter(
      (inv) => inv.fullName && inv.email && inv.role && isValidEmail(inv.email),
    );

    if (validInvites.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please fill in at least one complete invitation',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const results = await Promise.allSettled(
        validInvites.map((invite) =>
          createOrganizationUser({
            name: invite.fullName,
            email: invite.email,
            appRole: invite.role as UserRoleWithoutOld,
            moduleId,
          }),
        ),
      );

      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;

      if (successful > 0) {
        toast({
          title: 'Success',
          description: `Successfully invited ${successful} user${successful > 1 ? 's' : ''}`,
        });
      }

      if (failed > 0) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: `Failed to invite ${failed} user${failed > 1 ? 's' : ''}`,
        });
      }

      if (successful > 0) {
        refreshOrgData();

        setInvites([{ id: '1', fullName: '', email: '', role: '' }]);
        router.refresh();
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to send invitations',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {invites.map((invite, index) => (
          <div key={invite.id} className="space-y-1">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Full name"
                  value={invite.fullName}
                  onChange={(e) =>
                    updateInvite(invite.id, 'fullName', e.target.value)
                  }
                  className="h-9 text-sm"
                  disabled={isSubmitting}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Input
                  type="email"
                  placeholder="Email address"
                  value={invite.email}
                  onChange={(e) =>
                    updateInvite(invite.id, 'email', e.target.value)
                  }
                  onBlur={(e) => validateEmailOnBlur(invite.id, e.target.value)}
                  className={`h-9 text-sm ${invite.domainError ? 'border-destructive focus:border-destructive/50 focus-visible:ring-destructive/10' : ''}`}
                  disabled={isSubmitting}
                />
                {invite.domainError && (
                  <p className="text-xs text-destructive">
                    Email must be from @{orgDomain} domain
                  </p>
                )}
              </div>
              <div className="w-36">
                <RoleSelector
                  value={invite.role}
                  onValueChange={(value) =>
                    updateInvite(invite.id, 'role', value)
                  }
                  disabled={isSubmitting}
                />
              </div>
              {index > 0 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeInvite(invite.id)}
                  disabled={isSubmitting}
                  className="h-9 w-9"
                  aria-label="Remove invite"
                  title="Remove invite"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              ) : (
                invites.length > 1 && <div className="h-9 w-9" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={addInvite}
          disabled={isSubmitting || invites.length >= MAX_INVITES}
        >
          <PlusIcon className="h-4 w-4" /> Add more
          {invites.length >= MAX_INVITES && (
            <span className="ml-1 text-xs text-muted-foreground">
              (max {MAX_INVITES})
            </span>
          )}
        </Button>

        <Button onClick={handleSubmit} disabled={isSubmitting} size="sm">
          {isSubmitting ? 'Sending...' : 'Send Invites'}
        </Button>
      </div>
    </div>
  );
}
