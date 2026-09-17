import TrialSignUpForm from '@/components/auth/TrialSignUpForm';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { getUserMetadata } from '@/data/users';

export default async function SignUp() {
  const supabase = await createClient();
  const userMetadata = await getUserMetadata();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!userMetadata) {
    return null;
  }

  // if (!user || user.app_metadata.signed_up === true) {
  //   return redirect('/');
  // }

  return (
    <div className="mt-16 flex w-full flex-col items-center gap-12 px-8 py-12">
      <TrialSignUpForm user={user} userMetadata={userMetadata} />
    </div>
  );
}
