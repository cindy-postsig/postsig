'use client';

import { useEffect, useState, createContext } from 'react';
import { jwtDecode } from 'jwt-decode';
import { createClient } from '@/utils/supabase/client';
import { UserMetadata } from '@/constants/types';
import { reset as resetAumniUpload } from '@/app/(app)/(investor)/investor/documents/aumni-upload-manager';
import { abortAllActiveUploads } from '@/lib/upload/tus-upload';

import { PUBLIC_PATH_PREFIXES_FOR_REDIRECT } from '@/constants/auth';

export function buildSignedOutRedirect(currentPath: string): string | null {
  const routePath = currentPath.split(/[?#]/, 1)[0] || '/';
  if (routePath === '/') return null;
  if (PUBLIC_PATH_PREFIXES_FOR_REDIRECT.some((p) => routePath.startsWith(p)))
    return null;
  return `/login?message=${encodeURIComponent('Your session has ended. Please sign in again.')}&redirect=${encodeURIComponent(currentPath)}`;
}

function redirectToLoginIfNeeded(): void {
  if (typeof window === 'undefined') return;
  const target = buildSignedOutRedirect(
    `${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
  if (!target) return;
  // Full navigation, not router.push: clears any in-memory state from the
  // signed-out session and lets middleware reissue the proper redirect chain.
  window.location.assign(target);
}

/**
 * UserContext provides client-side user state and authentication utilities.
 *
 * ## JWT Trust Model
 *
 * This provider uses `jwt-decode` to extract claims from the access token.
 * Important security notes:
 *
 * 1. **Token Validation**: The JWT is NOT validated client-side. The `jwt-decode`
 *    library only decodes the payload without verifying the signature.
 *
 * 2. **Server-Side Validation**: Token validation is handled by Supabase:
 *    - Supabase Auth validates tokens when `auth.getSession()` is called
 *    - The proxy.ts enforces authentication and authorization checks
 *    - All sensitive operations use server-side session validation
 *
 * 3. **Role-Based Access Control**: While `user_role` is extracted here for UI
 *    purposes (e.g., conditional rendering), actual access control is enforced:
 *    - In proxy.ts via `accessDenied()` and role checks
 *    - In Server Actions before performing mutations
 *    - In database via Row Level Security (RLS) policies
 *
 * 4. **Client-Side Usage**: The role extracted here should only be used for:
 *    - UI rendering decisions (showing/hiding UI elements)
 *    - Optimistic updates that will be verified server-side
 *
 * Never trust client-side role checks for security-critical decisions.
 */
export const UserContext = createContext<{
  userLoaded: boolean;
  user: any;
  signOut: () => Promise<void>;
  userMetadata: UserMetadata | null;
} | null>(null);

export default function UserProvider({
  children,
  userMetadata,
}: {
  children: React.ReactNode;
  userMetadata: UserMetadata | null;
}) {
  const [userLoaded, setUserLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const supabase = createClient();

  useEffect(() => {
    function saveSession(
      /** @type {Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']} */
      session: any,
    ) {
      setSession(session);
      const currentUser = session?.user;
      if (session) {
        // Extract user_role from JWT for client-side UI rendering only.
        // Security: The token has already been validated by Supabase Auth.
        // This decode is safe because we only use the role for UI purposes;
        // actual authorization is enforced server-side in middleware and RLS.
        const jwt = jwtDecode(session.access_token);
        // @ts-ignore
        currentUser.appRole = jwt.user_role;
      }
      setUser(currentUser ?? null);
      setUserLoaded(!!currentUser);
    }

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => saveSession(session));

    const {
      data: { subscription: authListener },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Update UI state first so any redirect navigates from clean state, not
      // from a stale "logged-in" snapshot that would flash for a frame.
      saveSession(session);

      // SIGNED_OUT fires for: user-initiated signOut, token refresh failure,
      // and explicit session expiry. Only act when the session is genuinely
      // gone — a transient refresh that recovers will fire SIGNED_OUT with
      // session still present in some Supabase versions.
      if (event === 'SIGNED_OUT' && !session) {
        // Abort first — kills any in-flight tus.Upload anywhere in the app
        // (including useCpmUploadProcessor uploads not tracked by managers).
        // Without this, tus would 401 on next chunk, invalidate the upload
        // URL, and silently restart from byte 0.
        abortAllActiveUploads();
        resetAumniUpload();
        redirectToLoginIfNeeded();
      }
    });

    return () => {
      authListener.unsubscribe();
    };
  }, [children]);

  // Navigation on success happens via the onAuthStateChange listener's
  // SIGNED_OUT branch — no need to push a route here.
  const signOut = async () => {
    await supabase.auth.signOut();
  };
  return (
    <UserContext.Provider
      value={{
        userLoaded,
        user,
        signOut,
        userMetadata,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
