import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/service_server';
import { sendInviteEmail } from '@/app/lib/auth/actions';
import type { PostgrestError } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { email, next } = await request.json();
    const supabase = createClient();
    const otpType = 'magiclink';

    const {
      data: user,
      error,
    }: {
      data: { signed_up: boolean | null } | null;
      error: PostgrestError | null;
    } = await supabase
      .from('users')
      .select('signed_up')
      .eq('email', email)
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid user.' }, { status: 400 });
    }

    if (user.signed_up) {
      return NextResponse.json(
        { error: 'User has already signed up.' },
        { status: 400 },
      );
    }

    // Generate the invite link
    const { data: inviteData, error: inviteDataError } =
      await supabase.auth.admin.generateLink({
        type: otpType,
        email: email,
      });

    if (inviteDataError) {
      return NextResponse.json(
        { error: inviteDataError.message },
        { status: 400 },
      );
    }

    const token = inviteData.properties.hashed_token;
    await sendInviteEmail({
      token,
      email: email,
      otpType,
      next,
    });

    return NextResponse.json(
      { message: 'New invitation link sent!' },
      { status: 200 },
    );
  } catch (error) {
    console.error('Error refreshing invite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
