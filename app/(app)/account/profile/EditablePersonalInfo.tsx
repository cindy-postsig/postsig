'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { invalidateOrganizationDataCache } from '@/app/lib/actions/cache-actions';
import { cn } from '@/lib/utils';

interface Props {
  userId: string;
  initialName: string | null;
  initialJobTitle: string | null;
  initialDepartment: string | null;
}

export function EditablePersonalInfo({
  userId,
  initialName,
  initialJobTitle,
  initialDepartment,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState(initialName ?? '');
  const [jobTitle, setJobTitle] = useState(initialJobTitle ?? '');
  const [department, setDepartment] = useState(initialDepartment ?? '');

  async function save() {
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.from('users').upsert({
        id: userId,
        name: name.trim() || null,
        job_title: jobTitle.trim() || null,
        department: department.trim() || null,
        updated_at: new Date().toISOString(),
      } as any);
      if (error) throw error;
      // Cache invalidation is best-effort — don't fail the save if it errors.
      try {
        await invalidateOrganizationDataCache();
      } catch {
        // ignore; router.refresh() below will pull fresh data
      }
      toast({ description: 'Profile updated' });
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast({
        variant: 'destructive',
        description:
          err instanceof Error ? err.message : 'Could not save profile',
      });
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setName(initialName ?? '');
    setJobTitle(initialJobTitle ?? '');
    setDepartment(initialDepartment ?? '');
    setEditing(false);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h4 className="font-medium text-base">Personal</h4>
        {!editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )}
      </div>
      <Card>
        <CardContent className="p-0">
          <Row label="Name" first>
            {editing ? (
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
              />
            ) : (
              <ReadValue value={name} />
            )}
          </Row>
          <Row label="Job title">
            {editing ? (
              <Input
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="e.g. Product Designer"
              />
            ) : (
              <ReadValue value={jobTitle} />
            )}
          </Row>
          <Row label="Department">
            {editing ? (
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Design"
              />
            ) : (
              <ReadValue value={department} />
            )}
          </Row>
          {editing && (
            <div className="flex items-center justify-end gap-2 border-t p-4">
              <Button variant="ghost" onClick={cancel} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  first,
  children,
}: {
  label: string;
  first?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-[160px_1fr] items-center gap-4 px-5 py-4',
        !first && 'border-t',
      )}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function ReadValue({ value }: { value: string }) {
  return <div className="text-sm">{value.trim() || '—'}</div>;
}
