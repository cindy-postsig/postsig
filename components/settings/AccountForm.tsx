'use client';
import { createClient } from '@/utils/supabase/client';
import { useCallback, useEffect, useState } from 'react';
import { redirect, useRouter } from 'next/navigation';
import { type User } from '@supabase/supabase-js';
import { track } from '@vercel/analytics';
import { useToast } from '@/components/ui/use-toast';
import { generateToastError } from '@/utils/toast';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { invalidateOrganizationDataCache } from '@/app/lib/actions/cache-actions';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card';

export default function AccountForm({ user }: { user: User | null }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [jobTitle, setJobTitle] = useState<string | null>(null);
  const [organization, setOrganization] = useState<string | null>(null);
  const [department, setDepartment] = useState<string | null>(null);

  const router = useRouter();

  const getUser = useCallback(async () => {
    if (!user) {
      router.push('/login'); // Client-side redirection
      return;
    }

    try {
      setLoading(true);

      const { data, error, status } = await supabase
        .from('users')
        .select(`name, email, job_title, department`)
        .eq('id', user?.id)
        .single();

      if (error && status !== 406) {
        throw error;
      }

      if (data) {
        setName((data as any).name);
        setEmail((data as any).email);
        setJobTitle((data as any).job_title);
        //setOrganization(data.organization);
        setDepartment((data as any).department);
      }
    } catch (error: any) {
      toast(generateToastError(error.message, 'Error loading user!'));
    } finally {
      setLoading(false);
    }
  }, [user, supabase]);

  useEffect(() => {
    getUser();
  }, [user, getUser]);

  async function updateUser({
    name,
    jobTitle,
    //organization,
    department,
  }: {
    name: string | null;
    jobTitle: string | null;
    //organization: string | null;
    department: string | null;
  }) {
    if (!user) {
      redirect('/login');
    }
    track('Update Profile');
    try {
      setLoading(true);

      const { error } = await supabase.from('users').upsert({
        id: user?.id,
        name,
        job_title: jobTitle,
        //organization,
        department,
        updated_at: new Date().toISOString(),
      } as any);
      if (error) throw error;
      await invalidateOrganizationDataCache();
      toast({
        description: `Account information updated`,
        variant: 'default',
      });
    } catch (error: any) {
      toast(generateToastError(error.message, 'Error updating user!'));
    } finally {
      setLoading(false);
      window.location.reload();
    }
  }

  return (
    <Card>
      <CardContent className="flex justify-center pt-10">
        <form className="w-full max-w-md">
          <div className="space-y-7">
            <Label htmlFor="name">
              Name
              <Input
                id="name"
                type="text"
                value={name || ''}
                onChange={(e) => setName(e.target.value)}
              />
            </Label>
            <Label htmlFor="email">
              Email
              <Input type="email" id="email" value={email || ''} disabled />
            </Label>
            <Label htmlFor="jobTitle">
              Job Title
              <Input
                type="text"
                id="jobTitle"
                value={jobTitle || ''}
                onChange={(e) => setJobTitle(e.target.value)}
              />
            </Label>
            <Label htmlFor="department">
              Department
              <Input
                type="text"
                id="department"
                value={department || ''}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </Label>

            <Button
              className="mt-6 w-full"
              onClick={(e) => {
                e.preventDefault();
                updateUser({ name, jobTitle, department });
              }}
              disabled={loading}
            >
              {loading ? 'Loading ...' : 'Update Account'}
            </Button>
          </div>
        </form>
      </CardContent>
      <CardFooter></CardFooter>
    </Card>
  );
}
