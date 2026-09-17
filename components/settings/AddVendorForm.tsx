'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PlusIcon } from '@radix-ui/react-icons';
import { Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useAddVendors } from '@/hooks/api/useVendorWhitelist';
import logger from '@/utils/pino';

interface AddVendorFormProps {
  canUpdate: boolean;
}

interface VendorEntry {
  id: string;
  email: string;
  vendorName: string;
  emailError?: string;
}

const MAX_ENTRIES = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WILDCARD_REGEX = /^\*@[\w\-.]+\.\w+$/;

function isValidEmailOrWildcard(value: string): boolean {
  return EMAIL_REGEX.test(value) || WILDCARD_REGEX.test(value);
}

export function AddVendorForm({ canUpdate }: AddVendorFormProps) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<VendorEntry[]>([
    { id: '1', email: '', vendorName: '' },
  ]);
  const addVendors = useAddVendors();

  const addEntry = () => {
    if (entries.length >= MAX_ENTRIES) {
      toast({
        variant: 'destructive',
        title: 'Limit Reached',
        description: `You can only add up to ${MAX_ENTRIES} vendors at once`,
      });
      return;
    }
    const newId = crypto.randomUUID();
    setEntries((prev) => [...prev, { id: newId, email: '', vendorName: '' }]);
  };

  const updateEntry = (
    id: string,
    field: 'email' | 'vendorName',
    value: string,
  ) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;

        const updated = { ...entry, [field]: value };

        if (field === 'email' && entry.emailError) {
          updated.emailError = undefined;
        }

        return updated;
      }),
    );
  };

  const validateEmailOnBlur = (id: string, email: string) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== id) return entry;

        const trimmed = email.trim();
        return {
          ...entry,
          emailError:
            trimmed && !isValidEmailOrWildcard(trimmed)
              ? 'Enter a valid email (user@domain.com) or wildcard (*@domain.com)'
              : undefined,
        };
      }),
    );
  };

  const removeEntry = (id: string) => {
    setEntries((prev) =>
      prev.length === 1
        ? [{ id: '1', email: '', vendorName: '' }]
        : prev.filter((entry) => entry.id !== id),
    );
  };

  const handleSubmit = async () => {
    const trimmedEntries = entries.map((e) => ({
      ...e,
      email: e.email.trim(),
      vendorName: e.vendorName.trim(),
    }));

    const invalidEmails = trimmedEntries.filter(
      (e) => e.email && !isValidEmailOrWildcard(e.email),
    );

    if (invalidEmails.length > 0) {
      setEntries(
        trimmedEntries.map((entry) => ({
          ...entry,
          emailError:
            entry.email && !isValidEmailOrWildcard(entry.email)
              ? 'Enter a valid email (user@domain.com) or wildcard (*@domain.com)'
              : undefined,
        })),
      );
      toast({
        variant: 'destructive',
        title: 'Invalid email',
        description: 'Please enter valid email addresses or wildcards',
      });
      return;
    }

    const validEntries = trimmedEntries.filter((e) => e.email);

    if (validEntries.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Please enter at least one email or domain',
      });
      return;
    }

    try {
      const result = await addVendors.mutateAsync(
        validEntries.map((entry) => ({
          email: entry.email,
          vendorName: entry.vendorName || undefined,
        })),
      );

      const { added, updated } = result.summary;
      const total = added + updated;

      toast({
        title: 'Success',
        description:
          total === 1
            ? 'Vendor added to whitelist'
            : `Added ${added} vendor${added !== 1 ? 's' : ''}${updated > 0 ? `, updated ${updated}` : ''}`,
      });

      setEntries([{ id: '1', email: '', vendorName: '' }]);
    } catch (err) {
      logger.error({ err }, 'Failed to add vendors');
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to add vendors',
      });
    }
  };

  const hasValidEntry = entries.some((e) => e.email.trim());

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {entries.map((entry, index) => (
          <div key={entry.id} className="space-y-1">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-1">
                <Input
                  type="text"
                  placeholder="Email or domain (e.g., *@vendor.com)"
                  value={entry.email}
                  onChange={(e) =>
                    updateEntry(entry.id, 'email', e.target.value)
                  }
                  onBlur={(e) => validateEmailOnBlur(entry.id, e.target.value)}
                  className={`h-9 text-sm ${entry.emailError ? 'border-destructive focus:border-destructive/50 focus-visible:ring-destructive/10' : ''}`}
                  disabled={!canUpdate || addVendors.isPending}
                />
                {entry.emailError && (
                  <p className="text-xs text-destructive">{entry.emailError}</p>
                )}
              </div>
              <div className="flex-1">
                <Input
                  type="text"
                  placeholder="Vendor name (optional)"
                  value={entry.vendorName}
                  onChange={(e) =>
                    updateEntry(entry.id, 'vendorName', e.target.value)
                  }
                  className="h-9 text-sm"
                  disabled={!canUpdate || addVendors.isPending}
                />
              </div>
              {index > 0 ? (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeEntry(entry.id)}
                  disabled={addVendors.isPending}
                  className="h-9 w-9"
                  aria-label="Remove entry"
                  title="Remove entry"
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              ) : (
                entries.length > 1 && <div className="h-9 w-9" />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={addEntry}
          disabled={
            !canUpdate || addVendors.isPending || entries.length >= MAX_ENTRIES
          }
        >
          <PlusIcon className="h-4 w-4" /> Add more
          {entries.length >= MAX_ENTRIES && (
            <span className="ml-1 text-xs text-muted-foreground">
              (max {MAX_ENTRIES})
            </span>
          )}
        </Button>

        <Button
          onClick={handleSubmit}
          disabled={!canUpdate || addVendors.isPending || !hasValidEntry}
          size="sm"
        >
          {addVendors.isPending ? 'Adding...' : 'Add to Whitelist'}
        </Button>
      </div>
    </div>
  );
}
