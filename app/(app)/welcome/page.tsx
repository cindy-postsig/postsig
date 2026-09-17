// @ts-nocheck
import FileUpload from '@/components/ftux/FileUpload';
import FileUploadDemo from '@/components/demo/FileUpload';
import { redirect } from 'next/navigation';
import './styles.css';

import { createClient } from '@/utils/supabase/server';

export const maxDuration = 120;

export default async function Page() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }
  if (user) {
    redirect('/');
  }
  const ftux = user?.user_metadata.show_ftux;
  if (ftux === false && !user.email?.endsWith('@postsig.com')) {
    return redirect('/dashboard');
  }
  return (
    <>
      <main id="ftux" className="flex h-full flex-col justify-start">
        {user &&
          user.email &&
          (user.email?.includes('demo') &&
          user.email?.endsWith('@postsig.com') ? (
            <FileUploadDemo user={user} />
          ) : (
            <FileUpload user={user} />
          ))}
      </main>
    </>
  );
}
