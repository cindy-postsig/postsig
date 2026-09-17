import { createClient } from '@/utils/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import logger from '@/utils/pino';
import { refreshDocuSignTokenAndUpdateDb } from '@/utils/docusign';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const userResponse = await supabase.auth.getUser();

    if (!userResponse.data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
      await refreshDocuSignTokenAndUpdateDb(
        supabase,
        userResponse.data.user.id,
      );

      return NextResponse.json({
        success: true,
        message: 'Token refreshed successfully.',
      });
    } catch (refreshError: any) {
      logger.error({ error: refreshError }, 'Error refreshing token');
      return NextResponse.json(
        { error: refreshError.message || 'Failed to refresh token' },
        { status: 400 },
      );
    }
  } catch (error) {
    logger.error({ error }, 'Error in DocuSign token refresh route');
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 },
    );
  }
}
