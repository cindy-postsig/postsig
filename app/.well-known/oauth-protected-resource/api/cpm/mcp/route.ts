import { NextResponse } from 'next/server';
import { buildProtectedResourceMetadata } from '@/app/lib/mcp/oauth-metadata';

export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json(buildProtectedResourceMetadata('cpm'), {
    // s-maxage: Vercel's edge cache ignores max-age on dynamic responses;
    // without it every metadata fetch is a function invocation.
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}
