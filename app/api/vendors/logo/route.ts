import { NextResponse, NextRequest } from 'next/server';
import { getCacheService } from '@/app/lib/redis/cache-service';
import { fetchCompanyLogo } from '@/app/lib/logos/fetch-logo';
import logger from '@/utils/pino';

const LOGO_CACHE_TTL = 30 * 24 * 60 * 60;
const LOGO_NOT_FOUND_TTL = 30 * 24 * 60 * 60;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const LOGOS_BUCKET_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/storage/v1/object/public/logos`
  : null;

const SAFE_DOMAIN = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$/;

const CACHE_HEADERS = {
  'Cache-Control':
    'public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400',
} as const;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const name = searchParams.get('name')?.trim() || null;
  const domain = searchParams.get('domain')?.trim() || null;

  if (!name && !domain) {
    return NextResponse.json(
      { error: 'Name or domain parameter is required' },
      { status: 400 },
    );
  }

  try {
    if (domain && LOGOS_BUCKET_URL && SAFE_DOMAIN.test(domain)) {
      const overrideUrl = `${LOGOS_BUCKET_URL}/${domain}.png`;
      try {
        const head = await fetch(overrideUrl, {
          method: 'HEAD',
          signal: AbortSignal.timeout(1500),
        });
        if (head.ok) {
          return NextResponse.json(
            { url: overrideUrl, source: 'override' },
            { headers: CACHE_HEADERS },
          );
        }
      } catch {
        // fall through to external APIs
      }
    }

    const cacheService = await getCacheService();

    const cachedResult = await cacheService.getCompanyLogo(
      name || '',
      domain || '',
    );

    if (cachedResult !== null) {
      return NextResponse.json(cachedResult, { headers: CACHE_HEADERS });
    }

    logger.debug({ name, domain }, 'Vendor logo cache miss');

    const result = await fetchCompanyLogo(
      name || undefined,
      domain || undefined,
    );

    const hasLogo = !!result.url;
    const ttl = hasLogo ? LOGO_CACHE_TTL : LOGO_NOT_FOUND_TTL;

    await cacheService.cacheCompanyLogo(
      name || '',
      domain || '',
      hasLogo ? result : null,
      ttl,
    );

    return NextResponse.json(result, { headers: CACHE_HEADERS });
  } catch (error) {
    logger.error({ error, name, domain }, 'Error in vendor logo API route');
    return NextResponse.json(
      { error: 'Failed to fetch vendor logo' },
      { status: 500 },
    );
  }
}
