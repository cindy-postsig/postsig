import { createClient } from '@/utils/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Dropdown from '@/components/Dropdown';

export default async function AuthButton() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const username = user?.email?.split('@')[0] || null;

  const signOut = async () => {
    'use server';

    const supabase = await createClient();
    await supabase.auth.signOut();
    return redirect('/login');
  };

  return user ? (
    <div className="flex items-center gap-4">
      <Dropdown username={username} signOut={signOut} />
    </div>
  ) : (
    // <Link
    //   href="/login"
    //   className="bg-btn-background hover:bg-btn-background-hover flex rounded-md px-3 py-2 no-underline"
    // >
    //   Login
    // </Link>
    <></>
  );
}
