import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { auditLogger, extractAuditContext } from '@/lib/audit';
import logger from '@/utils/pino';
import { createUserPreference } from '@/data/superuser/users';
import { sanitizeForLogging } from '@/utils/log-sanitization';
import type { Database } from '@/database.types';
import type { PostgrestError } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const terms = url.searchParams.get('terms');

  const { password, name, jobTitle, department } = await request.json();

  const supabase = await createClient();
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();

  if (!sessionUser) {
    return NextResponse.json(new Error('Unauthorized'), { status: 401 });
  }

  const userId = sessionUser.id;
  const userEmail = sessionUser.email;

  if (terms === '1') {
    try {
      const context = extractAuditContext(request, { userId });

      const updateData: Database['public']['Tables']['users']['Update'] = {
        accepted_terms: true,
        signed_up: true,
        updated_at: new Date().toISOString(),
      };

      const { error: termsError }: { error: PostgrestError | null } =
        await supabase.from('users').update(updateData).eq('id', userId);

      if (termsError) {
        return NextResponse.json(
          { error: termsError.message },
          { status: 400 },
        );
      }

      try {
        await createUserPreference({
          userId,
          key: 'notifications.contract_uploads',
          value: true,
        });
      } catch (error) {
        logger.error(
          {
            error: sanitizeForLogging(error),
            userId,
            prefKey: 'notifications.contract_uploads',
          },
          'Failed to set default user preference',
        );
      }

      // Log terms acceptance
      await auditLogger.logUserEvent(
        'TERMS_ACCEPTED',
        userId,
        context,
        undefined,
        { accepted_terms: true, signed_up: true },
      );

      return NextResponse.json({
        status: 200,
        message: 'Terms accepted successfully',
      });
    } catch (error) {
      logger.error({ error }, 'Error updating user metadata');
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 },
      );
    }
  }

  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('users')
    .select('signed_up')
    .eq('id', userId)
    .maybeSingle();

  if (existingProfileError) {
    return NextResponse.json(
      { error: 'Failed to load existing profile' },
      { status: 500 },
    );
  }

  if (existingProfile?.signed_up === true && process.env.ENV === 'prod') {
    return NextResponse.json(new Error('Unauthorized'), { status: 401 });
  }

  if (!password) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    );
  }

  try {
    const context = extractAuditContext(request, { userId });

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const upsertData: Database['public']['Tables']['users']['Insert'] = {
      id: userId,
      name,
      job_title: jobTitle,
      department,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError }: { error: PostgrestError | null } =
      await supabase.from('users').upsert(upsertData);

    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 400 });
    }

    await auditLogger.logUserEvent(
      'USER_REGISTRATION',
      userId,
      context,
      undefined,
      { name, jobTitle, department, email: userEmail },
    );

    return NextResponse.json({ message: 'User signed up successfully' });
  } catch (error) {
    logger.error({ error }, 'Error signing up user');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
