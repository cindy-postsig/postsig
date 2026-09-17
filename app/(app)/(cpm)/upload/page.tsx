import CpmUploadPage from './CpmUploadPage';
import FileUploadDemo from '@/components/demo/FileUpload';
import { getUserMetadata } from '@/data/users';
import { verifyAbility } from '@/data/user-permissions';
import { redirect } from 'next/navigation';

export default async function Page() {
  const user = await getUserMetadata();
  if (!user) {
    return null;
  }
  try {
    await verifyAbility('create', 'Contract');
  } catch (error) {
    redirect('/contracts');
  }
  const isDemo =
    typeof user.userProfile?.email === 'string' &&
    user.userProfile.email.includes('demo') &&
    user.userProfile.email.endsWith('@postsig.com');
  return (
    <>
      <main className="flex h-full flex-col justify-start">
        {isDemo ? (
          <FileUploadDemo user={user} />
        ) : (
          <CpmUploadPage user={user} />
        )}
      </main>
    </>
  );
}
