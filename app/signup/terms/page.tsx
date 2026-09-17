import Terms from '@/components/auth/Terms';
import { createClient } from '@/utils/supabase/server';
import { getUserMetadata } from '@/data/users';

function getEnvironmentBaseUrl(): string {
  const env = process.env.ENV || 'local';

  if (env === 'local') {
    return '/';
  }

  const appUrls: Record<string, string> = {
    prod: 'https://app.postsig.com',
    dev: 'https://dev.postsig.com',
    staging: 'https://staging.postsig.com',
  };
  return appUrls[env] || '/';
}

export default async function AcceptTerms() {
  const supabase = await createClient();
  const userMetadata = await getUserMetadata();
  if (!userMetadata) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const defaultBasePath = userMetadata.defaultModule?.basePath;

  // Users with non-default module paths get redirected to their module
  // Users with default CPM path use environment-based routing
  const hasCustomModulePath =
    defaultBasePath && defaultBasePath !== '/dashboard';
  const redirectUrl = hasCustomModulePath
    ? defaultBasePath
    : getEnvironmentBaseUrl();

  return (
    <div className="flex h-screen max-w-4xl flex-col items-center justify-center gap-6 px-8 py-12 font-serif">
      <Terms user={user} redirectUrl={redirectUrl} />
    </div>
  );
}
