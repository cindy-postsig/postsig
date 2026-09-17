'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { Resend } from 'resend';
import InviteEmailTemplate from '@/emails/InviteEmail';
import { ResetPasswordEmailTemplate } from '@/emails/ResetPasswordEmail';
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { ExternalServiceError } from '../../../lib/errors';
import logger from '@/utils/pino';
import {
  auditLogger,
  extractAuditContext,
  getUserAuditContext,
} from '@/lib/audit';

export async function sendInviteEmail({
  token,
  email,
  otpType,
  next,
}: {
  token: string;
  email: string;
  otpType?: string;
  next?: string;
}) {
  noStore();

  try {
    const { RESEND_API_KEY } = process.env;
    const resend = new Resend(RESEND_API_KEY);

    const emailTemplate = InviteEmailTemplate({ token, otpType, email, next });

    const { data } = await resend.emails.send({
      from: 'PostSig <noreply@postsig.com>',
      to: [email],
      subject: 'Set up your PostSig account',
      react: emailTemplate as React.ReactElement,
    });
    return data;
  } catch (error) {
    logger.error(error, 'Failed to send invite email');
    throw new ExternalServiceError(
      'Resend',
      'Failed to send invite email',
      error as Error,
    );
  }
}

export async function sendPasswordResetEmail({
  otpToken,
  email,
}: {
  otpToken: string;
  email: string;
}) {
  noStore();

  try {
    const { RESEND_API_KEY } = process.env;
    const resend = new Resend(RESEND_API_KEY);

    const emailTemplate = ResetPasswordEmailTemplate({
      otpToken,
      email,
    });

    const { data } = await resend.emails.send({
      from: 'PostSig <noreply@postsig.com>',
      to: [email],
      subject: 'Reset your password',
      react: emailTemplate as React.ReactElement,
    });
    return data;
  } catch (error) {
    logger.error(error, 'Failed to send invite email');
    throw new ExternalServiceError(
      'Resend',
      'Failed to send invite email',
      error as Error,
    );
  }
}

export async function signOut() {
  const context = await getUserAuditContext();
  const supabase = await createClient();

  // Log logout event before signing out
  await auditLogger.logAuthenticationEvent('LOGOUT', {
    ...context,
    metadata: {
      logoutTime: new Date().toISOString(),
    },
  });

  await supabase.auth.signOut();
  redirect('/login');
}
