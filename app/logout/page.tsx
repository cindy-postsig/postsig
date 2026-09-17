import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export default async function Logout({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ message: string }>;
}) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { message } = await searchParamsPromise;
  return redirect(`/login?message=${message}`);
}
