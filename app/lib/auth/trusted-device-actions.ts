'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@/utils/supabase/service_server';
import logger from '@/utils/pino';
import { Database } from '@/database.types';
import {
  TRUSTED_DEVICE_COOKIE_NAME,
  TRUSTED_DEVICE_TTL_MS,
} from '@/constants/security';
import { DEFAULT_URL } from '@/app/lib/constants';
import { sendResendEmail } from '@/app/lib/actions';
import { TrustedDeviceAddedEmail } from '@/emails/TrustedDeviceAddedEmail';
import { getEffectiveDateFormat } from '@/data/users';
import { formatDateTime } from '@/lib/date-format';
import {
  DeviceContext,
  SecureDeviceInfo,
  generateDeviceName,
  validateDeviceContext,
  createTrustExpirationDate,
  isTrustExpired,
  sanitizeDeviceInfo,
  getServerDeviceContext,
  sha256Hex,
  randomHex,
} from '@/app/lib/auth/trusted-device-utils';
import { logTrustedDeviceEvent } from '@/lib/audit';

type TrustedDeviceRow = Database['public']['Tables']['trusted_devices']['Row'];
type TrustedDeviceInsert =
  Database['public']['Tables']['trusted_devices']['Insert'];

export interface TrustDeviceResult {
  success: boolean;
  error?: string;
}

/**
 * Why a presented device token failed validation. Recorded so a re-prompt can
 * be attributed to a specific cause instead of a bare `false`.
 */
export type TrustFailureReason =
  | 'no_cookie'
  | 'no_matching_row'
  | 'user_agent_changed'
  | 'lookup_error';

export interface TrustedDeviceInfo {
  id: string;
  deviceName: string | null;
  trustedAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isExpired: boolean;
  deviceInfo: any;
}

export async function updateTrustedDevice(
  userId: string,
  rawDeviceToken: string,
  data: Partial<TrustedDeviceRow>,
  organizationId: string | undefined,
): Promise<void> {
  try {
    const tokenHash = await sha256Hex(rawDeviceToken);

    const serviceSupabase = createServiceClient();

    const { data: trustedDevice, error: selectError } = await serviceSupabase
      .from('trusted_devices')
      .select('*')
      .eq('user_id', userId)
      .eq('device_token', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (selectError || !trustedDevice) {
      logger.warn(
        { error: selectError, userId, action: 'updateTrustedDevice' },
        'Trusted device not found for updating recent use',
      );
      return;
    }

    const { data: updatedDevice, error: updateError } = await serviceSupabase
      .from('trusted_devices')
      .update(data)
      .eq('user_id', userId)
      .eq('device_token', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .select()
      .single();

    if (updateError) {
      logger.error(
        { error: updateError, userId, action: 'updateTrustedDevice' },
        'Error updating recent use for trusted device',
      );
      return;
    }

    const deviceContext = await getServerDeviceContext();

    // Audit: trusted device updated
    await logTrustedDeviceEvent('UPDATE', updatedDevice?.id || 'unknown', {
      newData: (updatedDevice ?? undefined) as
        | Record<string, unknown>
        | undefined,
      oldData: (trustedDevice ?? undefined) as
        | Record<string, unknown>
        | undefined,
      userId,
      organizationId,
      context: {
        ipAddress: deviceContext.ipAddress,
        userAgent: deviceContext.userAgent,
      },
    });
  } catch (error) {
    logger.error(
      { error, userId, action: 'updateTrustedDevice' },
      'Error updating recent use for trusted device',
    );
  }
}

/**
 * Server-side validation of device token (middleware-friendly)
 *
 * Returns the rejection reason rather than logging it. This runs on every
 * request that carries a trust cookie — including exempt paths like
 * /mfa/verify, where no redirect follows — so logging here would emit many
 * lines per re-prompt. The caller logs once, at the redirect boundary.
 */
export async function validateDeviceTokenServer(
  userId: string,
  rawDeviceToken: string,
): Promise<{ isValid: boolean; reason?: TrustFailureReason }> {
  try {
    const tokenHash = await sha256Hex(rawDeviceToken);
    const deviceContext = await getServerDeviceContext();

    const serviceSupabase = createServiceClient();
    // maybeSingle so a genuine query failure surfaces as an error instead of
    // sharing the null-data path with "no live row matched" — misreporting
    // infrastructure trouble as a token mismatch would poison the diagnostics.
    const { data: trustedDevice, error: lookupError } = await serviceSupabase
      .from('trusted_devices')
      .select('user_agent, ip_address, expires_at')
      .eq('user_id', userId)
      .eq('device_token', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (lookupError) {
      logger.error(
        { error: lookupError, userId, action: 'validateDeviceTokenServer' },
        'Trusted device lookup failed',
      );
      return { isValid: false, reason: 'lookup_error' };
    }

    if (!trustedDevice) {
      return { isValid: false, reason: 'no_matching_row' };
    }

    // Validate device context
    const storedContext: DeviceContext = {
      userAgent: trustedDevice.user_agent || undefined,
      ipAddress: (trustedDevice.ip_address as string) || undefined,
    };

    const validation = validateDeviceContext(deviceContext, storedContext);

    if (!validation.isValid) {
      return { isValid: false, reason: 'user_agent_changed' };
    }

    return { isValid: true };
  } catch (error) {
    logger.error(
      { error, userId, action: 'validateDeviceTokenServer' },
      'Error validating device token',
    );
    return { isValid: false, reason: 'lookup_error' };
  }
}

/**
 * Trust a device after successful MFA verification using secure tokens
 */
export async function trustDevice(): Promise<TrustDeviceResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      logger.warn({ action: 'trustDevice' }, 'User not authenticated');
      return { success: false, error: 'User not authenticated' };
    }

    const rawDeviceToken = randomHex(32);
    const tokenHash = await sha256Hex(rawDeviceToken);

    const deviceContext = await getServerDeviceContext();
    const deviceName = generateDeviceName(deviceContext.userAgent);
    const expiresAt = createTrustExpirationDate();

    const deviceInfo: SecureDeviceInfo = {
      name: deviceName,
      ipAddress: deviceContext.ipAddress,
      userAgent: deviceContext.userAgent,
    };

    const serviceSupabase = createServiceClient();

    // Create new trusted device
    const trustedDeviceData: TrustedDeviceInsert = {
      user_id: user.id,
      device_token: tokenHash, // Store hash, not raw token
      device_name: deviceName,
      device_info: sanitizeDeviceInfo(deviceInfo) as any,
      trusted_at: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      ip_address: deviceContext.ipAddress as any,
      user_agent: deviceContext.userAgent,
    };

    const { data: newDevice, error: insertError } = await serviceSupabase
      .from('trusted_devices')
      .insert(trustedDeviceData)
      .select()
      .single();

    if (insertError || !newDevice) {
      logger.error(
        { error: insertError, userId: user.id, action: 'trustDevice' },
        'Failed to create trusted device',
      );
      return { success: false, error: 'Failed to trust device' };
    }

    // Audit: trusted device created
    await logTrustedDeviceEvent('CREATE', newDevice.id, {
      newData: {
        device_name: deviceName,
        user_agent: deviceContext.userAgent || null,
        ip_address: deviceContext.ipAddress || null,
        trusted_at: newDevice.trusted_at,
        expires_at: newDevice.expires_at,
      },
      userId: user.id,
      organizationId: (user.user_metadata as any)?.organization_id,
      context: {
        ipAddress: deviceContext.ipAddress,
        userAgent: deviceContext.userAgent,
      },
    });

    // Set server-side rather than via document.cookie: an HttpOnly cookie is
    // out of reach of XSS, and it survives the client-side cookie clearing
    // (endpoint security policies, extensions, clear-on-close) that was
    // silently dropping the token and re-prompting users on every visit.
    const cookieStore = await cookies();
    cookieStore.set(TRUSTED_DEVICE_COOKIE_NAME, rawDeviceToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(TRUSTED_DEVICE_TTL_MS / 1000),
    });

    logger.info(
      {
        userId: user.id,
        deviceId: newDevice.id,
        expiresAt: expiresAt.toISOString(),
        action: 'trustDevice',
      },
      'Device trusted successfully',
    );

    // Send notification email about new trusted device
    if (user.email) {
      try {
        const dateFormat = await getEffectiveDateFormat();
        const template = TrustedDeviceAddedEmail({
          deviceName,
          ipAddress: deviceContext.ipAddress || null,
          userAgent: deviceContext.userAgent || null,
          trustedAt: formatDateTime(
            newDevice.trusted_at || new Date().toISOString(),
            dateFormat,
          ),
          securityUrl: `${DEFAULT_URL}/account/security`,
        });

        await sendResendEmail({
          subject: 'New trusted device added to your PostSig account',
          template,
          emailList: [user.email],
        });
      } catch (e: any) {
        logger.error(
          { error: e?.message, userId: user.id, action: 'trustDevice' },
          'Failed to send new trusted device email notification',
        );
      }
    }

    return { success: true };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'trustDevice' },
      'Failed to trust device',
    );
    return {
      success: false,
      error: 'Failed to trust device. Please try again.',
    };
  }
}

/**
 * Get all trusted devices for the current user
 */
export async function getUserTrustedDevices(): Promise<{
  devices: TrustedDeviceInfo[];
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { devices: [], error: 'User not authenticated' };
    }

    const serviceSupabase = createServiceClient();
    const { data: devices, error } = await serviceSupabase
      .from('trusted_devices')
      .select('*')
      .eq('user_id', user.id)
      .order('last_used_at', { ascending: false });

    if (error) {
      logger.error(
        { error, userId: user.id, action: 'getUserTrustedDevices' },
        'Failed to fetch trusted devices',
      );
      return { devices: [], error: 'Failed to fetch trusted devices' };
    }

    const trustedDevices: TrustedDeviceInfo[] = devices.map((device) => ({
      id: device.id,
      deviceName: device.device_name,
      trustedAt: device.trusted_at,
      lastUsedAt: device.last_used_at,
      expiresAt: device.expires_at,
      isExpired: isTrustExpired(device.expires_at),
      deviceInfo: device.device_info,
    }));

    return { devices: trustedDevices };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'getUserTrustedDevices' },
      'Failed to get user trusted devices',
    );
    return { devices: [], error: 'Failed to fetch trusted devices' };
  }
}

/**
 * Remove trust from a specific device
 */
export async function untrustDevice(deviceId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const serviceSupabase = createServiceClient();
    const { data: deletedDevice, error } = await serviceSupabase
      .from('trusted_devices')
      .delete()
      .eq('id', deviceId)
      .eq('user_id', user.id)
      .select('id, device_name, user_agent, ip_address, trusted_at, expires_at')
      .single();

    if (error) {
      logger.error(
        { error, userId: user.id, deviceId, action: 'untrustDevice' },
        'Failed to untrust device',
      );
      return { success: false, error: 'Failed to remove trusted device' };
    }

    const deviceContext = await getServerDeviceContext();

    // Audit: trusted device deleted
    await logTrustedDeviceEvent('DELETE', deviceId, {
      oldData: {
        device_name: deletedDevice?.device_name ?? null,
        user_agent: deletedDevice?.user_agent ?? null,
        ip_address: (deletedDevice as any)?.ip_address ?? null,
        trusted_at: deletedDevice?.trusted_at ?? null,
        expires_at: deletedDevice?.expires_at ?? null,
      },
      userId: user.id,
      organizationId: (user.user_metadata as any)?.organization_id,
      context: {
        ipAddress: deviceContext.ipAddress,
        userAgent: deviceContext.userAgent,
      },
    });

    logger.info(
      { userId: user.id, deviceId, action: 'untrustDevice' },
      'Device trust removed successfully',
    );

    return { success: true };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'untrustDevice' },
      'Failed to untrust device',
    );
    return { success: false, error: 'Failed to remove trusted device' };
  }
}

/**
 * Remove trust from all devices for the current user
 */
export async function untrustAllDevices(): Promise<{
  success: boolean;
  removedCount?: number;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'User not authenticated' };
    }

    const serviceSupabase = createServiceClient();
    const { data: deletedDevices, error } = await serviceSupabase
      .from('trusted_devices')
      .delete()
      .eq('user_id', user.id)
      .select(
        'id, device_name, user_agent, ip_address, trusted_at, expires_at',
      );

    if (error) {
      logger.error(
        { error, userId: user.id, action: 'untrustAllDevices' },
        'Failed to untrust all devices',
      );
      return { success: false, error: 'Failed to remove all trusted devices' };
    }

    const count = deletedDevices ? deletedDevices.length : 0;

    const deviceContext = await getServerDeviceContext();

    // Audit: trusted devices deleted
    await Promise.all(
      (deletedDevices ?? []).map((d) =>
        logTrustedDeviceEvent('DELETE', d.id, {
          oldData: {
            device_name: d.device_name ?? null,
            user_agent: d.user_agent ?? null,
            ip_address: (d as any).ip_address ?? null,
            trusted_at: d.trusted_at ?? null,
            expires_at: d.expires_at ?? null,
          },
          userId: user.id,
          organizationId: (user.user_metadata as any)?.organization_id,
          context: {
            ipAddress: deviceContext.ipAddress,
            userAgent: deviceContext.userAgent,
          },
        }),
      ),
    );

    logger.info(
      { userId: user.id, removedCount: count, action: 'untrustAllDevices' },
      'All device trusts removed successfully',
    );

    return { success: true, removedCount: count || 0 };
  } catch (error: any) {
    logger.error(
      { error: error.message, action: 'untrustAllDevices' },
      'Failed to untrust all devices',
    );
    return { success: false, error: 'Failed to remove all trusted devices' };
  }
}
