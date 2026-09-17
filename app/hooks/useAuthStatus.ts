import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { checkMFATrustStatus } from '@/app/lib/auth/mfa-actions';

export interface AuthStatus {
  isLoading: boolean;
  isAuthenticated: boolean;
  needsMFA: boolean;
  user: any | null;
  mfaType: 'totp' | 'email' | null;
}

export function useAuthStatus() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    isLoading: true,
    isAuthenticated: false,
    needsMFA: false,
    user: null,
    mfaType: null,
  });

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const supabase = createClient();

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setAuthStatus({
            isLoading: false,
            isAuthenticated: false,
            needsMFA: false,
            user: null,
            mfaType: null,
          });
          return;
        }

        const mfaTrust = await checkMFATrustStatus();

        setAuthStatus({
          isLoading: false,
          isAuthenticated: true,
          needsMFA: mfaTrust.needsVerification,
          user,
          mfaType: mfaTrust.mfaType,
        });
      } catch (error) {
        setAuthStatus({
          isLoading: false,
          isAuthenticated: false,
          needsMFA: false,
          user: null,
          mfaType: null,
        });
      }
    };

    checkAuthStatus();
  }, []);

  return authStatus;
}
