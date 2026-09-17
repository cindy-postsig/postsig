'use client';

import {
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Pencil } from 'lucide-react';
import { useAbility } from '@/components/providers/AbilityProvider';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { updateVendorDetails } from '@/app/lib/vendors/actions';
import type {
  VendorOrgDetails,
  VendorOrgDetailsInput,
} from '@/lib/v2/vendors/details';

const LABEL_CLASS = 'font-bold font-label text-xs uppercase tracking-wide';

export function VendorOrgDetailsSection({
  vendorId,
  details,
}: {
  vendorId: number;
  details: VendorOrgDetails;
}) {
  const canEdit = useAbility().can('update', 'Vendor');
  const [editing, setEditing] = useState(false);
  const hasContact = Boolean(
    details.primaryContactName ||
    details.primaryContactEmail ||
    details.primaryContactPhone,
  );

  return (
    <section className="w-full space-y-6 border-t border-black border-opacity-10 pt-12">
      <div className="flex items-center justify-between">
        <h3>Relationship</h3>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>
      <div className="grid w-full grid-cols-4 gap-12">
        <div className="col-span-3 flex flex-col gap-1">
          <h2 className={LABEL_CLASS}>Notes</h2>
          {details.notes ? (
            <p className="whitespace-pre-wrap font-serif text-lg">
              {details.notes}
            </p>
          ) : (
            <p className="font-serif text-lg text-muted-foreground">
              No notes yet.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <h2 className={LABEL_CLASS}>Primary Contact</h2>
          {hasContact ? (
            <div className="flex flex-col font-label text-sm">
              {details.primaryContactName && (
                <span>{details.primaryContactName}</span>
              )}
              {details.primaryContactEmail && (
                <a
                  href={`mailto:${details.primaryContactEmail}`}
                  className="text-primary hover:underline"
                >
                  {details.primaryContactEmail}
                </a>
              )}
              {details.primaryContactPhone && (
                <a
                  href={`tel:${details.primaryContactPhone}`}
                  className="hover:underline"
                >
                  {details.primaryContactPhone}
                </a>
              )}
            </div>
          ) : (
            <p className="font-label text-sm text-muted-foreground">None</p>
          )}
        </div>
      </div>
      {canEdit && (
        <Dialog open={editing} onOpenChange={setEditing}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit relationship details</DialogTitle>
              <DialogDescription>
                Visible to your organization only.
              </DialogDescription>
            </DialogHeader>
            <VendorOrgDetailsForm
              vendorId={vendorId}
              details={details}
              onClose={() => setEditing(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

function toDraft(details: VendorOrgDetails): VendorOrgDetailsInput {
  return {
    primaryContactName: details.primaryContactName ?? '',
    primaryContactEmail: details.primaryContactEmail ?? '',
    primaryContactPhone: details.primaryContactPhone ?? '',
    notes: details.notes ?? '',
  };
}

function VendorOrgDetailsForm({
  vendorId,
  details,
  onClose,
}: {
  vendorId: number;
  details: VendorOrgDetails;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [draft, setDraft] = useState(() => toDraft(details));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const setField =
    (field: keyof VendorOrgDetailsInput) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft((current) => ({ ...current, [field]: event.target.value }));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateVendorDetails(vendorId, draft);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast({ title: 'Vendor details saved' });
        onClose();
      } catch {
        setError('Could not save vendor details. Please try again.');
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="vendor-contact-name">Contact name</Label>
        <Input
          id="vendor-contact-name"
          value={draft.primaryContactName}
          onChange={setField('primaryContactName')}
          autoComplete="off"
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="vendor-contact-email">Email</Label>
          <Input
            id="vendor-contact-email"
            type="email"
            value={draft.primaryContactEmail}
            onChange={setField('primaryContactEmail')}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vendor-contact-phone">Phone</Label>
          <Input
            id="vendor-contact-phone"
            type="tel"
            value={draft.primaryContactPhone}
            onChange={setField('primaryContactPhone')}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="vendor-notes">Notes</Label>
        <Textarea
          id="vendor-notes"
          rows={6}
          value={draft.notes}
          onChange={setField('notes')}
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  );
}
