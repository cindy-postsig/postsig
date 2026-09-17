'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import { revalidatePath } from 'next/cache';
import logger from '@/utils/pino';
import {
  checkMfaRateLimit,
  clearMfaFailures,
  recordMfaFailure,
} from '@/app/lib/auth/login-rate-limit';
import { rateLimitMessage } from '@/app/lib/auth/rate-limit-message';
import { randomBytes, sha256Hash, randomInt } from '@/utils/edge-crypto';
import { sendResendEmail } from '@/app/lib/actions';
import { EmailMFAVerificationTemplate } from '@/emails/EmailMFAVerificationTemplate';
import { differenceInSeconds, differenceInMinutes, formatISO } from 'date-fns';
import type { MfaSessionState, MfaType } from '@/constants/types';
import type { User } from '@supabase/supabase-js';
import { validateDeviceTokenServer } from '@/app/lib/auth/trusted-device-actions';
import type { TrustFailureReason } from '@/app/lib/auth/trusted-device-actions';
import { isMfaSessionValid } from '@/app/lib/auth/trusted-device-utils';
import { isSsoUser } from '@/app/lib/auth/sso-identity';
import { cookies } from 'next/headers';
import { TRUSTED_DEVICE_COOKIE_NAME } from '@/constants/security';

interface MFAEnrollResult {
  data?: {
    type: string;
    totp?: {
      qr_code: string;
      secret: string;
      uri: string;
    };
  };
  error?: string;
}

interface MFAVerifyResult {
  success: boolean;
  error?: string;
  aal?: string;
}

interface BackupCode {
  id: string;
  code: string;
  used: boolean;
}

function isExpired(lastSent: string, durationInMinutes: number) {
  const lastSentDate = new Date(lastSent);
  const now = new Date();
  const diffInMinutes = differenceInMinutes(now, lastSentDate);
  return diffInMinutes > durationInMinutes;
}

export async function enrollMFA(): Promise<MFAEnrollResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn({ action: 'enrollMFA' }, 'User not authenticated');
      return { error: 'User not authenticated' };
    }

    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
    });

    if (error) {
      logger.error(
        { error, userId: user.id, action: 'enrollMFA' },
        'Failed to enroll MFA',
      );
      return { error: error.message };
    }

    logger.info(
      { userId: user.id, factorId: data.id, action: 'enrollMFA' },
      'MFA enrollment started',
    );

    return {
      data: {
        type: data.type,
        totp: {
          qr_code: data.totp.qr_code,
          secret: data.totp.secret,
          uri: data.totp.uri,
        },
      },
    };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'enrollMFA' },
      'MFA enrollment failed',
    );
    return { error: 'Failed to enroll MFA. Please try again.' };
  }
}

export async function verifyMFAEnrollment(
  code: string,
): Promise<MFAVerifyResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn({ action: 'verifyMFAEnrollment' }, 'User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    const rateLimit = await checkMfaRateLimit(user.id);
    if (!rateLimit.allowed) {
      logger.warn(
        { userId: user.id, action: 'verifyMFAEnrollment' },
        'Too many MFA verification attempts',
      );
      return {
        success: false,
        error: rateLimitMessage(rateLimit.retryAfterSeconds),
      };
    }

    // Get the most recent challenge for the first factor
    const factor = user.factors?.[0];
    if (!factor?.id) {
      logger.error(
        { userId: user.id, action: 'verifyMFAEnrollment' },
        'No MFA factor found',
      );
      return { success: false, error: 'No MFA factor found' };
    }

    const challenge = await supabase.auth.mfa.challenge({
      factorId: factor.id,
    });

    if (challenge.error) {
      logger.error(
        {
          error: challenge.error,
          userId: user.id,
          action: 'verifyMFAEnrollment',
        },
        'Failed to create MFA challenge',
      );
      return { success: false, error: challenge.error.message };
    }

    const { data, error } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challenge?.data?.id, // Use the challenge ID returned above
      code,
    });

    if (error) {
      await recordMfaFailure(user.id);
      logger.error(
        { error, userId: user.id, action: 'verifyMFAEnrollment' },
        'Failed to verify MFA enrollment',
      );
      return { success: false, error: error.message };
    }

    await clearMfaFailures(user.id);

    // Update user MFA status in database
    const serviceSupabase = createServiceClient();
    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        mfa_enabled: true,
        mfa_type: 'totp',
        mfa_last_verified_at: new Date().toISOString(),
        email_mfa_enabled: false,
        email_mfa_secret: null,
        email_mfa_last_sent: null,
        email_mfa_attempts: 0,
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error(
        { error: updateError, userId: user.id, action: 'verifyMFAEnrollment' },
        'Failed to update user MFA status',
      );
      return { success: false, error: 'Failed to update user MFA status' };
    }

    logger.info(
      { userId: user.id, action: 'verifyMFAEnrollment' },
      'MFA enrollment verified successfully',
    );

    return { success: true, aal: data.access_token ? 'aal2' : 'aal1' };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'verifyMFAEnrollment' },
      'MFA enrollment verification failed',
    );
    return {
      success: false,
      error: 'Failed to verify MFA code. Please try again.',
    };
  }
}

export async function verifyMFAChallenge(
  code: string,
): Promise<MFAVerifyResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn({ action: 'verifyMFAChallenge' }, 'User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    const rateLimit = await checkMfaRateLimit(user.id);
    if (!rateLimit.allowed) {
      logger.warn(
        { userId: user.id, action: 'verifyMFAChallenge' },
        'Too many MFA verification attempts',
      );
      return {
        success: false,
        error: rateLimitMessage(rateLimit.retryAfterSeconds),
      };
    }

    const factor = user.factors?.[0];
    if (!factor?.id) {
      logger.error(
        { userId: user.id, action: 'verifyMFAChallenge' },
        'No MFA factor found',
      );
      return { success: false, error: 'No MFA factor found' };
    }

    // First create a challenge
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({
        factorId: factor.id,
      });

    if (challengeError || !challengeData) {
      logger.error(
        {
          error: challengeError,
          userId: user.id,
          action: 'verifyMFAChallenge',
        },
        'Failed to create MFA challenge',
      );
      return { success: false, error: 'Failed to create MFA challenge' };
    }

    // Then verify the challenge
    const { data, error } = await supabase.auth.mfa.verify({
      factorId: factor.id,
      challengeId: challengeData.id,
      code,
    });

    if (error) {
      await recordMfaFailure(user.id);
      logger.error(
        { error, userId: user.id, action: 'verifyMFAChallenge' },
        'Failed to verify MFA challenge',
      );
      return { success: false, error: error.message };
    }

    await clearMfaFailures(user.id);

    const serviceSupabase = createServiceClient();
    await serviceSupabase
      .from('users')
      .update({
        mfa_last_verified_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    logger.info(
      { userId: user.id, action: 'verifyMFAChallenge' },
      'MFA challenge verified successfully',
    );

    return { success: true, aal: data.access_token ? 'aal2' : 'aal1' };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'verifyMFAChallenge' },
      'MFA challenge verification failed',
    );
    return {
      success: false,
      error: 'Failed to verify MFA code. Please try again.',
    };
  }
}

export async function disableMFA(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn({ action: 'disableMFA' }, 'User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    // Unenroll all MFA factors
    if (user.factors && user.factors.length > 0) {
      for (const factor of user.factors) {
        const { error } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
        if (error) {
          logger.error(
            {
              error,
              userId: user.id,
              factorId: factor.id,
              action: 'disableMFA',
            },
            'Failed to unenroll MFA factor',
          );
          return { success: false, error: error.message };
        }
      }
    }

    // Update user MFA status in database
    const serviceSupabase = createServiceClient();
    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        mfa_enabled: false,
        mfa_type: null,
        email_mfa_enabled: false,
        email_mfa_secret: null,
        email_mfa_last_sent: null,
        email_mfa_attempts: 0,
        backup_codes_generated: false,
        backup_codes_used: [],
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error(
        { error: updateError, userId: user.id, action: 'disableMFA' },
        'Failed to update user MFA status',
      );
      return { success: false, error: 'Failed to update user status' };
    }

    logger.info(
      { userId: user.id, action: 'disableMFA' },
      'MFA disabled successfully',
    );

    revalidatePath('/settings/security');
    return { success: true };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'disableMFA' },
      'Failed to disable MFA',
    );
    return {
      success: false,
      error: 'Failed to disable MFA. Please try again.',
    };
  }
}

export async function generateBackupCodes(): Promise<{
  success: boolean;
  codes?: string[];
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn({ action: 'generateBackupCodes' }, 'User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    // Generate 10 random backup codes
    const codes = Array.from({ length: 10 }, () => {
      return randomBytes(4);
    });

    // Store hashed versions in database
    const hashedCodes = await Promise.all(
      codes.map((code) => sha256Hash(code)),
    );

    const serviceSupabase = createServiceClient();
    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        backup_codes_generated: true,
        backup_codes_used: hashedCodes.map((hash) => ({ hash, used: false })),
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error(
        { error: updateError, userId: user.id, action: 'generateBackupCodes' },
        'Failed to store backup codes',
      );
      return { success: false, error: 'Failed to generate backup codes' };
    }

    logger.info(
      {
        userId: user.id,
        codesGenerated: codes.length,
        action: 'generateBackupCodes',
      },
      'Backup codes generated successfully',
    );

    revalidatePath('/settings/security');
    return { success: true, codes };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'generateBackupCodes' },
      'Failed to generate backup codes',
    );
    return {
      success: false,
      error: 'Failed to generate backup codes. Please try again.',
    };
  }
}

export async function verifyBackupCode(code: string): Promise<MFAVerifyResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn({ action: 'verifyBackupCode' }, 'User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    const rateLimit = await checkMfaRateLimit(user.id);
    if (!rateLimit.allowed) {
      logger.warn(
        { userId: user.id, action: 'verifyBackupCode' },
        'Too many MFA verification attempts',
      );
      return {
        success: false,
        error: rateLimitMessage(rateLimit.retryAfterSeconds),
      };
    }

    const serviceSupabase = createServiceClient();
    const { data: userData, error: fetchError } = await serviceSupabase
      .from('users')
      .select('backup_codes_used')
      .eq('id', user.id)
      .single();

    if (fetchError || !userData) {
      logger.error(
        { error: fetchError, userId: user.id, action: 'verifyBackupCode' },
        'Failed to fetch user backup codes',
      );
      return { success: false, error: 'Failed to verify backup code' };
    }

    const backupCodes = userData.backup_codes_used as Array<{
      hash: string;
      used: boolean;
    }>;
    const codeHash = await sha256Hash(code.toUpperCase());

    // Find matching code that hasn't been used
    const matchingCode = backupCodes.find(
      (bc) => bc.hash === codeHash && !bc.used,
    );
    if (!matchingCode) {
      await recordMfaFailure(user.id);
      logger.warn(
        { userId: user.id, action: 'verifyBackupCode' },
        'Invalid or used backup code',
      );
      return { success: false, error: 'Invalid or already used backup code' };
    }

    // Mark code as used
    const updatedCodes = backupCodes.map((bc) =>
      bc.hash === codeHash ? { ...bc, used: true } : bc,
    );

    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        backup_codes_used: updatedCodes,
        mfa_last_verified_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error(
        { error: updateError, userId: user.id, action: 'verifyBackupCode' },
        'Failed to update backup code status',
      );
      return { success: false, error: 'Failed to verify backup code' };
    }

    await clearMfaFailures(user.id);

    const factor = user.factors?.[0];
    if (factor?.id) {
      try {
        // Create a challenge
        const { data: challengeData, error: challengeError } =
          await supabase.auth.mfa.challenge({
            factorId: factor.id,
          });

        if (!challengeError && challengeData) {
          await supabase.auth.refreshSession();
        }
      } catch (challengeError) {
        logger.warn(
          {
            error: challengeError,
            userId: user.id,
            action: 'verifyBackupCode',
          },
          'Failed to create MFA challenge for AAL2 update',
        );
      }
    }

    logger.info(
      { userId: user.id, action: 'verifyBackupCode' },
      'Backup code verified successfully',
    );

    return { success: true, aal: 'aal2' };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'verifyBackupCode' },
      'Backup code verification failed',
    );
    return {
      success: false,
      error: 'Failed to verify backup code. Please try again.',
    };
  }
}

export async function getMFAStatus(): Promise<{
  enabled: boolean;
  hasBackupCodes: boolean;
  factorCount: number;
  mfaType?: string;
  emailMfaEnabled?: boolean;
  signedUp: boolean;
}> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return {
        enabled: false,
        hasBackupCodes: false,
        factorCount: 0,
        signedUp: false,
      };
    }

    const serviceSupabase = createServiceClient();
    const { data: userData } = await serviceSupabase
      .from('users')
      .select(
        'mfa_enabled, backup_codes_generated, mfa_type, email_mfa_enabled, signed_up',
      )
      .eq('id', user.id)
      .single();

    return {
      enabled: userData?.mfa_enabled || false,
      hasBackupCodes: userData?.backup_codes_generated || false,
      factorCount: user.factors?.length || 0,
      mfaType: userData?.mfa_type || undefined,
      emailMfaEnabled: userData?.email_mfa_enabled || false,
      signedUp: userData?.signed_up || false,
    };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'getMFAStatus' },
      'Failed to get MFA status',
    );
    return {
      enabled: false,
      hasBackupCodes: false,
      factorCount: 0,
      signedUp: false,
    };
  }
}

export async function cleanupAllMFAFactors(): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.factors) return { success: true };

  for (const factor of user.factors) {
    const response = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (response.error) {
      logger.error(
        {
          error: response.error,
          factorId: factor.id,
          userId: user.id,
          action: 'cleanupAllMFAFactors',
        },
        'Failed to cleanup MFA factor',
      );
      return { success: false, error: response.error.message };
    }
  }

  return { success: true };
}

export async function cleanupOrphanedMFAFactors(): Promise<{
  success: boolean;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.factors) return { success: true };

  for (const factor of user.factors) {
    if (factor.status !== 'verified') {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  return { success: true };
}

export async function cleanupExpiredEmailMFASessions(): Promise<{
  success: boolean;
  cleaned?: number;
  error?: string;
}> {
  try {
    const serviceSupabase = createServiceClient();

    // Calculate 8 hours ago
    const eightHoursAgo = new Date(
      Date.now() - 8 * 60 * 60 * 1000,
    ).toISOString();

    // Clear expired email MFA session verifications
    const { error: updateError, count } = await serviceSupabase
      .from('users')
      .update({
        email_mfa_session_verified_at: null,
      })
      .lt('email_mfa_session_verified_at', eightHoursAgo)
      .not('email_mfa_session_verified_at', 'is', null);

    if (updateError) {
      logger.error(
        { error: updateError, action: 'cleanupExpiredEmailMFASessions' },
        'Failed to cleanup expired email MFA sessions',
      );
      return { success: false, error: updateError.message };
    }

    logger.info(
      { cleaned: count, action: 'cleanupExpiredEmailMFASessions' },
      'Cleaned up expired email MFA sessions',
    );

    return { success: true, cleaned: count || 0 };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'cleanupExpiredEmailMFASessions' },
      'Failed to cleanup expired email MFA sessions',
    );
    return {
      success: false,
      error: 'Failed to cleanup expired sessions. Please try again.',
    };
  }
}

// Email MFA Functions

export async function enrollEmailMFA(): Promise<MFAEnrollResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      logger.warn(
        { action: 'enrollEmailMFA' },
        'User not authenticated or no email',
      );
      return { error: 'User not authenticated or no email address' };
    }

    // Disable any existing MFA first

    // Generate email MFA secret and send verification email
    const code = generateEmailOTP();
    const hashedCode = await sha256Hash(code);

    const serviceSupabase = createServiceClient();
    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        mfa_type: 'email',
        email_mfa_enabled: false, // Will be enabled after verification
        email_mfa_secret: hashedCode,
        email_mfa_last_sent: new Date().toISOString(),
        email_mfa_attempts: 0,
        backup_codes_generated: false,
        backup_codes_used: [],
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error(
        { error: updateError, userId: user.id, action: 'enrollEmailMFA' },
        'Failed to update user email MFA status',
      );
      return { error: 'Failed to setup email MFA' };
    }

    // Send verification email
    await sendEmailMFACode(user.id, user.email, code, 'setup');

    logger.info(
      { userId: user.id, action: 'enrollEmailMFA' },
      'Email MFA enrollment started',
    );

    return {
      data: {
        type: 'email',
      },
    };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'enrollEmailMFA' },
      'Email MFA enrollment failed',
    );
    return { error: 'Failed to enroll email MFA. Please try again.' };
  }
}

export async function verifyEmailMFAEnrollment(
  code: string,
): Promise<MFAVerifyResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn(
        { action: 'verifyEmailMFAEnrollment' },
        'User not authenticated',
      );
      return { success: false, error: 'User not authenticated' };
    }

    const rateLimit = await checkMfaRateLimit(user.id);
    if (!rateLimit.allowed) {
      logger.warn(
        { userId: user.id, action: 'verifyEmailMFAEnrollment' },
        'Too many MFA verification attempts',
      );
      return {
        success: false,
        error: rateLimitMessage(rateLimit.retryAfterSeconds),
      };
    }

    const serviceSupabase = createServiceClient();
    const { data: userData, error: fetchError } = await serviceSupabase
      .from('users')
      .select('email_mfa_secret, email_mfa_attempts, email_mfa_last_sent')
      .eq('id', user.id)
      .single();

    if (userData?.email_mfa_last_sent) {
      if (isExpired(userData.email_mfa_last_sent, 10)) {
        return {
          success: false,
          error: 'Email MFA code expired.  Please request a new code.',
        };
      }
    }

    if (fetchError || !userData?.email_mfa_secret) {
      logger.error(
        {
          error: fetchError,
          userId: user.id,
          action: 'verifyEmailMFAEnrollment',
        },
        'No email MFA setup found',
      );
      return { success: false, error: 'No email MFA setup found' };
    }

    // Check rate limiting
    if (userData.email_mfa_attempts && userData.email_mfa_attempts >= 5) {
      logger.warn(
        { userId: user.id, action: 'verifyEmailMFAEnrollment' },
        'Too many verification attempts',
      );
      return {
        success: false,
        error: 'Too many attempts. Please request a new code.',
      };
    }

    // Verify the code
    const hashedCode = await sha256Hash(code);
    if (hashedCode !== userData.email_mfa_secret) {
      // Increment attempt counter
      const { error: updateError } = await serviceSupabase
        .from('users')
        .update({ email_mfa_attempts: (userData.email_mfa_attempts || 0) + 1 })
        .eq('id', user.id);

      if (updateError) {
        logger.error(
          {
            error: updateError,
            userId: user.id,
            action: 'verifyEmailMFAEnrollment',
          },
          'Failed to increment email MFA attempts',
        );
      }

      await recordMfaFailure(user.id);

      logger.warn(
        { userId: user.id, action: 'verifyEmailMFAEnrollment' },
        'Invalid email MFA code',
      );
      return {
        success: false,
        error: 'Invalid verification code. Please try again.',
      };
    }

    await clearMfaFailures(user.id);

    // Remove TOTP factors FIRST, before updating database
    if (user.factors && user.factors.length > 0) {
      for (const factor of user.factors) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });

        if (unenrollError) {
          logger.error(
            {
              error: unenrollError,
              factorId: factor.id,
              userId: user.id,
              action: 'verifyEmailMFAEnrollment',
            },
            'Failed to unenroll TOTP factor',
          );
          return {
            success: false,
            error: 'Failed to remove existing authenticator. Please try again.',
          };
        }
      }
    }

    // Enable email MFA
    const now = new Date().toISOString();
    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        mfa_enabled: true,
        mfa_type: 'email',
        email_mfa_enabled: true,
        email_mfa_secret: null,
        email_mfa_attempts: 0,
        email_mfa_last_sent: null,
        email_mfa_session_verified_at: now,
        mfa_last_verified_at: now,
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error(
        {
          error: updateError,
          userId: user.id,
          action: 'verifyEmailMFAEnrollment',
        },
        'Failed to enable email MFA',
      );
      return { success: false, error: 'Failed to enable email MFA' };
    }

    logger.info(
      { userId: user.id, action: 'verifyEmailMFAEnrollment' },
      'Email MFA enrollment verified successfully',
    );

    return { success: true, aal: 'aal2' };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'verifyEmailMFAEnrollment' },
      'Email MFA enrollment verification failed',
    );
    return {
      success: false,
      error: 'Failed to verify email MFA code. Please try again.',
    };
  }
}

export async function challengeEmailMFA(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      logger.warn(
        { action: 'challengeEmailMFA' },
        'User not authenticated or no email',
      );
      return { success: false, error: 'User not authenticated' };
    }

    const serviceSupabase = createServiceClient();
    const { data: userData, error: fetchError } = await serviceSupabase
      .from('users')
      .select('email_mfa_enabled, email_mfa_last_sent')
      .eq('id', user.id)
      .single();

    if (fetchError || !userData?.email_mfa_enabled) {
      logger.error(
        { error: fetchError, userId: user.id, action: 'challengeEmailMFA' },
        'Email MFA not enabled',
      );
      return { success: false, error: 'Email MFA not enabled' };
    }

    // Rate limiting: max 1 email per 60 seconds
    if (userData.email_mfa_last_sent) {
      const diffInSeconds = differenceInSeconds(
        new Date(),
        new Date(userData.email_mfa_last_sent),
      );
      if (diffInSeconds < 60) {
        logger.warn(
          { userId: user.id, action: 'challengeEmailMFA' },
          'Email MFA rate limit exceeded',
        );
        return {
          success: false,
          error: `Please wait ${Math.ceil(60 - diffInSeconds)} seconds before requesting another code.`,
        };
      }
    }

    // Generate and send email MFA code
    const code = generateEmailOTP();
    const hashedCode = await sha256Hash(code);

    const { error: updateError } = await serviceSupabase
      .from('users')
      .update({
        email_mfa_secret: hashedCode,
        email_mfa_last_sent: new Date().toISOString(),
        email_mfa_attempts: 0,
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error(
        { error: updateError, userId: user.id, action: 'challengeEmailMFA' },
        'Failed to update email MFA challenge',
      );
      return { success: false, error: 'Failed to send email MFA code' };
    }

    // Send verification email
    await sendEmailMFACode(user.id, user.email, code, 'login');

    logger.info(
      { userId: user.id, action: 'challengeEmailMFA' },
      'Email MFA challenge sent successfully',
    );

    return { success: true };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'challengeEmailMFA' },
      'Email MFA challenge failed',
    );
    return {
      success: false,
      error: 'Failed to send email MFA code. Please try again.',
    };
  }
}

export async function verifyEmailMFAChallenge(
  code: string,
): Promise<MFAVerifyResult> {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      logger.warn(
        { action: 'verifyEmailMFAChallenge' },
        'User not authenticated',
      );
      return { success: false, error: 'User not authenticated' };
    }

    const rateLimit = await checkMfaRateLimit(user.id);
    if (!rateLimit.allowed) {
      logger.warn(
        { userId: user.id, action: 'verifyEmailMFAChallenge' },
        'Too many MFA verification attempts',
      );
      return {
        success: false,
        error: rateLimitMessage(rateLimit.retryAfterSeconds),
      };
    }

    const serviceSupabase = createServiceClient();
    const { data: userData, error: fetchError } = await serviceSupabase
      .from('users')
      .select('email_mfa_secret, email_mfa_attempts, email_mfa_last_sent')
      .eq('id', user.id)
      .single();

    if (fetchError || !userData?.email_mfa_secret) {
      logger.error(
        {
          error: fetchError,
          userId: user.id,
          action: 'verifyEmailMFAChallenge',
        },
        'No email MFA challenge found',
      );
      return {
        success: false,
        error: 'No email MFA challenge found. Please request a new code.',
      };
    }

    // Check if code is expired (10 minutes)
    if (userData.email_mfa_last_sent) {
      const lastSent = new Date(userData.email_mfa_last_sent);
      const now = new Date();
      const diffInMinutes = differenceInMinutes(now, lastSent);

      if (diffInMinutes > 10) {
        logger.warn(
          { userId: user.id, action: 'verifyEmailMFAChallenge' },
          'Email MFA code expired',
        );
        return {
          success: false,
          error: 'Verification code has expired. Please request a new code.',
        };
      }
    }

    // Check rate limiting
    if (userData.email_mfa_attempts && userData.email_mfa_attempts >= 5) {
      logger.warn(
        { userId: user.id, action: 'verifyEmailMFAChallenge' },
        'Too many verification attempts',
      );
      return {
        success: false,
        error: 'Too many attempts. Please request a new code.',
      };
    }

    // Verify the code
    const hashedCode = await sha256Hash(code);
    if (hashedCode !== userData.email_mfa_secret) {
      // Increment attempt counter
      await serviceSupabase
        .from('users')
        .update({ email_mfa_attempts: (userData.email_mfa_attempts || 0) + 1 })
        .eq('id', user.id);

      await recordMfaFailure(user.id);

      logger.warn(
        { userId: user.id, action: 'verifyEmailMFAChallenge' },
        'Invalid email MFA code',
      );
      return { success: false, error: 'Invalid verification code' };
    }

    await clearMfaFailures(user.id);

    // Bind this verification to the current Supabase session so it cannot be
    // inherited by another device. getClaims() (no arg) reads and verifies the
    // current session's access token and exposes the gotrue session_id claim.
    // A null session_id stores null, which the trust check treats as no match
    // (re-prompts) — safe.
    let sessionId: string | null = null;
    try {
      const { data: claimsData } = await supabase.auth.getClaims();
      sessionId =
        (claimsData?.claims?.session_id as string | undefined) ?? null;
    } catch (claimsError) {
      logger.error(
        {
          error: claimsError,
          userId: user.id,
          action: 'verifyEmailMFAChallenge',
        },
        'Failed to read session_id while verifying email MFA',
      );
    }

    // Clear the challenge and mark email MFA as verified for this session
    const now = new Date().toISOString();
    await serviceSupabase
      .from('users')
      .update({
        email_mfa_secret: null,
        email_mfa_attempts: 0,
        email_mfa_session_verified_at: now,
        email_mfa_session_id: sessionId,
        mfa_last_verified_at: now,
      })
      .eq('id', user.id);

    logger.info(
      { userId: user.id, action: 'verifyEmailMFAChallenge' },
      'Email MFA challenge verified successfully',
    );

    return { success: true, aal: 'aal2' };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'verifyEmailMFAChallenge' },
      'Email MFA challenge verification failed',
    );
    return {
      success: false,
      error: 'Failed to verify email MFA code. Please try again.',
    };
  }
}

export async function checkExistingEmailMFAChallenge(): Promise<{
  hasValidChallenge: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn(
        { action: 'checkExistingEmailMFAChallenge' },
        'User not authenticated',
      );
      return { hasValidChallenge: false, error: 'User not authenticated' };
    }

    const serviceSupabase = createServiceClient();
    const { data: userData, error: fetchError } = await serviceSupabase
      .from('users')
      .select('email_mfa_secret, email_mfa_last_sent')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      logger.error(
        {
          error: fetchError,
          userId: user.id,
          action: 'checkExistingEmailMFAChallenge',
        },
        'Failed to check existing email MFA challenge',
      );
      return {
        hasValidChallenge: false,
        error: 'Failed to check challenge status',
      };
    }

    // Check if there's an active challenge (has secret and was sent within 10 minutes)
    if (userData?.email_mfa_secret && userData?.email_mfa_last_sent) {
      const lastSent = new Date(userData.email_mfa_last_sent);
      const now = new Date();
      const diffInMinutes = differenceInMinutes(now, lastSent);

      if (diffInMinutes < 10) {
        logger.info(
          {
            userId: user.id,
            minutesRemaining: 10 - diffInMinutes,
            action: 'checkExistingEmailMFAChallenge',
          },
          'Valid email MFA challenge exists',
        );
        return { hasValidChallenge: true };
      }
    }

    return { hasValidChallenge: false };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'checkExistingEmailMFAChallenge' },
      'Failed to check existing email MFA challenge',
    );
    return {
      hasValidChallenge: false,
      error: 'Failed to check challenge status. Please try again.',
    };
  }
}

function generateEmailOTP(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

async function sendEmailMFACode(
  userId: string,
  email: string,
  code: string,
  type: 'setup' | 'login',
): Promise<void> {
  const subject =
    type === 'setup'
      ? 'Complete Your Email MFA Setup'
      : 'Your PostSig Login Verification Code';

  const template = EmailMFAVerificationTemplate({ code, type });

  await sendResendEmail({
    template,
    subject,
    emailList: [email],
  });

  // Update email_mfa_last_sent timestamp after successful email sending
  const serviceSupabase = createServiceClient();
  const { error: updateError } = await serviceSupabase
    .from('users')
    .update({
      email_mfa_last_sent: new Date().toISOString(),
    })
    .eq('id', userId);

  if (updateError) {
    logger.error(
      { error: updateError, email, action: 'sendEmailMFACode' },
      'Failed to update email_mfa_last_sent timestamp',
    );
    // Don't throw error as email was already sent successfully
  }
}

/**
 * Work the caller has already paid for. The middleware runs on the edge, a
 * long way from the database, so it hands over the user it just authenticated
 * and the MFA columns it already selected rather than have this function
 * repeat the round trips. Omit either and it fetches that piece itself.
 */
interface MfaTrustSession {
  user: User;
  mfa?: MfaSessionState | null;
}

export async function checkMFATrustStatus(session?: MfaTrustSession): Promise<{
  needsVerification: boolean;
  needsMFAEnroll: boolean;
  lastVerifiedAt: string | null;
  mfaType: MfaType;
  trustFailureReason?: TrustFailureReason;
}> {
  if (
    process.env.DISABLE_MFA === 'true' &&
    process.env.VERCEL_ENV !== 'production'
  ) {
    return {
      needsVerification: false,
      needsMFAEnroll: false,
      lastVerifiedAt: null,
      mfaType: null,
    };
  }

  try {
    const supabase = await createClient();
    const user = session?.user ?? (await supabase.auth.getUser()).data.user;

    if (!user) {
      return {
        needsVerification: false,
        needsMFAEnroll: false,
        lastVerifiedAt: null,
        mfaType: null,
      };
    }

    // SSO sessions delegate MFA to the customer's IdP (Entra conditional
    // access); app-level MFA on top would double-challenge those users.
    if (isSsoUser(user)) {
      return {
        needsVerification: false,
        needsMFAEnroll: false,
        lastVerifiedAt: null,
        mfaType: null,
      };
    }

    let userData = session?.mfa ?? null;

    if (!userData) {
      const serviceSupabase = createServiceClient();
      const { data, error: userDataError } = await serviceSupabase
        .from('users')
        .select(
          'mfa_enabled, mfa_last_verified_at, mfa_type, email_mfa_session_verified_at, email_mfa_session_id',
        )
        .eq('id', user.id)
        .single();

      if (userDataError) {
        // Fail closed: a DB error here must not be read as "no MFA enrolled"
        // (which would route an enrolled user to enrollment) or as trusted.
        logger.error(
          {
            error: userDataError,
            userId: user.id,
            action: 'checkMFATrustStatus',
          },
          'Failed to load MFA status; requiring verification',
        );
        return {
          needsVerification: true,
          needsMFAEnroll: false,
          lastVerifiedAt: null,
          mfaType: null,
        };
      }

      userData = data;
    }

    if (!userData?.mfa_enabled) {
      return {
        needsVerification: false,
        needsMFAEnroll: true,
        lastVerifiedAt: null,
        mfaType: null,
      };
    }

    const isEmailMfa = userData.mfa_type === 'email';
    const lastVerified = isEmailMfa
      ? userData.email_mfa_session_verified_at
      : userData.mfa_last_verified_at;

    const cookieStore = await cookies();
    const deviceToken = cookieStore.get(TRUSTED_DEVICE_COOKIE_NAME)?.value;
    const trustResult = deviceToken
      ? await validateDeviceTokenServer(user.id, deviceToken)
      : { isValid: false, reason: 'no_cookie' as const };
    const isTrustedDevice = trustResult.isValid;

    // AAL2 (TOTP) and session_id (email) are both session-scoped, so only
    // consult them when recency alone would otherwise decide access for a
    // non-trusted device.
    let isAAL2 = false;
    let isEmailSessionMatch = false;

    if (!isTrustedDevice && !isEmailMfa) {
      const { data: aal, error: aalError } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) {
        // Leave isAAL2 false so a TOTP session fails closed to verification.
        logger.error(
          { error: aalError, userId: user.id, action: 'checkMFATrustStatus' },
          'Failed to read authenticator assurance level; treating session as unelevated',
        );
      } else {
        isAAL2 = aal?.currentLevel === 'aal2';
      }
    }

    if (!isTrustedDevice && isEmailMfa) {
      // Fail closed: if session_id can't be read, leave isEmailSessionMatch
      // false so email MFA re-verifies rather than inheriting the account-global
      // timestamp from a verification done in another session.
      try {
        const { data: claimsData } = await supabase.auth.getClaims();
        const currentSessionId =
          (claimsData?.claims?.session_id as string | undefined) ?? null;
        isEmailSessionMatch =
          !!currentSessionId &&
          userData.email_mfa_session_id === currentSessionId;
      } catch (claimsError) {
        logger.error(
          {
            error: claimsError,
            userId: user.id,
            action: 'checkMFATrustStatus',
          },
          'Failed to read session_id; requiring email MFA verification',
        );
      }
    }

    const allow = isMfaSessionValid({
      isTrustedDevice,
      isEmailMfa,
      isAAL2,
      isEmailSessionMatch,
      lastVerifiedAt: lastVerified,
    });

    return {
      needsVerification: !allow,
      needsMFAEnroll: false,
      lastVerifiedAt: lastVerified,
      mfaType: userData.mfa_type as MfaType,
      trustFailureReason: allow ? undefined : trustResult.reason,
    };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'checkMFATrustStatus' },
      'Failed to check MFA trust status',
    );
    return {
      needsVerification: true,
      needsMFAEnroll: false,
      lastVerifiedAt: null,
      mfaType: null,
    };
  }
}
