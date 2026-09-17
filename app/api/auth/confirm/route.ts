import { createClient } from '@/utils/supabase/server';
import { type EmailOtpType } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/pino';
import { logError, sanitizeForLogging } from '@/utils/log-sanitization';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = searchParams.get('next') ?? '/';
  const email = searchParams.get('email');
  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = next;

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (error) {
      logError(logger, error, { email, type });
      redirectTo.pathname = `/signup/token-expired`;

      // Append the email parameter, properly encoding it
      if (email) {
        redirectTo.searchParams.set(
          'email',
          encodeURIComponent(email).replace(/%20/g, '+'),
        );
      }

      return NextResponse.redirect(redirectTo);
    }

    if (!error) {
      return NextResponse.redirect(redirectTo);
    }
  }

  // return the user to an error page with some instructions
  redirectTo.pathname = '/auth/auth-code-error';
  return NextResponse.redirect(redirectTo);
}
