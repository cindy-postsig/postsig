import SignUpForm from '@/components/auth/SignUpForm';
import { redirect } from 'next/navigation';
import { getUserMetadata } from '@/data/users';

export default async function SignUp() {
  const userMetadata = await getUserMetadata();

  if (
    !userMetadata ||
    (userMetadata.userProfile?.signed_up && process.env.ENV === 'prod')
  ) {
    return redirect('/');
  }

  return (
    <div className="mt-16 flex flex-col items-center gap-10 px-8 py-12">
      <SignUpForm user={userMetadata.userProfile} />
    </div>
  );
}
