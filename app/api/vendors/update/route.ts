import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/service_server';
import { getUserMetadata } from '@/data/users';
import { checkAbility } from '@/data/user-permissions';
import { PostgrestError } from '@supabase/supabase-js';
import { Database } from '@/database.types';

export async function POST(request: NextRequest) {
  const supabase = createClient();

  try {
    // Authorize before reading the body, so an unauthorized caller cannot make
    // the server parse an arbitrarily large payload on the way to a 403.
    const user = await getUserMetadata();
    if (!user || !user.organizationId) {
      return NextResponse.json(
        { error: 'User not authenticated or organization not found.' },
        { status: 401 },
      );
    }
    const { organizationId } = user;

    if (!(await checkAbility('manage', 'Vendor'))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { vendorIds, isIctProvider } = await request.json();

    if (
      !Array.isArray(vendorIds) ||
      vendorIds.length === 0 ||
      typeof isIctProvider !== 'boolean'
    ) {
      return NextResponse.json(
        {
          error:
            'Missing or invalid required fields: vendorIds (array) and isIctProvider (boolean) are required.',
        },
        { status: 400 },
      );
    }

    const orgSettingsUpserts: Database['public']['Tables']['organization_vendor_settings']['Insert'][] =
      vendorIds.map((vendorId) => ({
        organization_id: organizationId,
        vendor_id: vendorId,
        settings: { ict_provider: isIctProvider },
      }));

    const { error: orgSettingsError }: { error: PostgrestError | null } =
      await supabase
        .from('organization_vendor_settings')
        .upsert(orgSettingsUpserts, {
          onConflict: 'organization_id, vendor_id',
        });

    if (orgSettingsError) {
      console.error(
        'Error upserting organization_vendor_settings:',
        orgSettingsError,
      );
      return NextResponse.json(
        { error: orgSettingsError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      message:
        'Vendor ICT provider status updated successfully for the organization.',
      data: orgSettingsUpserts,
    });
  } catch (error: any) {
    console.error('Error processing request in /api/vendors/update:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
