import { NextResponse, NextRequest } from 'next/server';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { fetchVendorProfile } from '@/app/lib/vendors/fetch-profile';
import { getUserMetadata } from '@/data/users';
import logger from '@/utils/pino';

const PROFILE_CACHE_TTL = 30 * 24 * 60 * 60; // 30 days
const PROFILE_NOT_FOUND_TTL = 7 * 24 * 60 * 60; // 7 days for not found

/**
 * GET /api/vendors/profile - Unified vendor profile endpoint
 *
 * Fetches comprehensive vendor data from multiple sources (Brandfetch, Companies API)
 * and returns a unified profile with description, logo, year founded, address, socials, etc.
 *
 * Query params:
 * - domain: Company domain (required)
 * - name: Company name (optional, for context)
 *
 * Returns: VendorProfile object with aggregated data from all sources
 */
export async function GET(request: NextRequest) {
  const user = await getUserMetadata();
  if (!user?.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const domain = searchParams.get('domain')?.trim() || null;
  const name = searchParams.get('name')?.trim() || null;

  if (!domain) {
    return NextResponse.json(
      { error: 'Domain parameter is required' },
      { status: 400 },
    );
  }

  try {
    const cacheService = await getCacheService();

    // Check cache first
    const cached = await cacheService.getCompanyProfile(domain);

    if (cached !== null) {
      if ((cached as any).__notFound) {
        logger.debug({ domain }, 'Vendor profile cache hit - not found');
        return NextResponse.json(null, { status: 404 });
      }
      logger.debug({ domain, name }, 'Vendor profile cache hit');
      return NextResponse.json(cached);
    }

    const raw = await fetchVendorProfile(domain);

    // Strip provider payloads before caching/returning (avoid leaking raw API data)
    const profile = raw
      ? {
          domain: raw.domain,
          description: raw.description,
          logo: raw.logo,
          logoSource: raw.logoSource,
          yearFounded: raw.yearFounded,
          address: raw.address,
          socials: raw.socials,
        }
      : null;

    // Cache the result
    const hasProfile = !!profile;
    const ttl = hasProfile ? PROFILE_CACHE_TTL : PROFILE_NOT_FOUND_TTL;

    await cacheService.cacheCompanyProfile(domain, profile, ttl);

    logger.info(
      { domain, name, found: hasProfile, ttl },
      'Vendor profile fetched and cached',
    );

    if (!hasProfile) {
      return NextResponse.json(null, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    logger.error({ error, domain, name }, 'Error in vendor profile API route');
    return NextResponse.json(
      { error: 'Failed to fetch vendor profile' },
      { status: 500 },
    );
  }
}
