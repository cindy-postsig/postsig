'use server';
import { createClient } from '@/utils/supabase/service_server';
import { AuthenticationError, DatabaseError } from '@/lib/errors';
import { errors } from '@/constants/system';
import { getUserRole } from '@/data/users';

export async function getUserMetadata() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userRole = await getUserRole();
  if (!user) throw new AuthenticationError('User not authenticated');
  return { userId: user.id, userRole };
}

export async function getAllOrgUsers(orgId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('organization_id', orgId);
  if (error || data.length === 0)
    throw new DatabaseError(
      'Error fetching organization users',
      error || undefined,
    );
  return data.map((user: any) => user.id);
}

export async function createUserPreference({
  userId,
  key,
  value,
}: {
  userId: string;
  key: string;
  value: boolean;
}) {
  const supabase = createClient();
  const { data: insertData, error } = await supabase
    .from('user_preferences')
    .insert({
      user_id: userId,
      preference_key: key,
      preference_value: value,
      updated_at: new Date().toISOString(),
    })
    .select();
  if (error) throw error;
  return insertData;
}
