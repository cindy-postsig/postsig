import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { Database } from '@/database.types';

const getCookieDomain = () => {
  if (process.env.ENV === 'production') {
    return '.postsig.com';
  }
  return undefined;
};

export const createClient = async () => {
  const cookieStore = await cookies();
  const cookieDomain = getCookieDomain();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookieOptions = { ...options, domain: cookieDomain };
              if (!cookieDomain) {
                delete cookieOptions.domain;
              }
              cookieStore.set(name, value, cookieOptions);
            });
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    },
  );
};
