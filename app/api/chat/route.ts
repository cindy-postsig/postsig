/**
 * @deprecated This endpoint is deprecated.
 * Use /api/v2/chat/stream instead.
 *
 * This file redirects requests to the new V2 chat endpoint for backwards compatibility.
 */

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const url = new URL(req.url);
  const newUrl = `${url.origin}/api/v2/chat/stream`;

  const body = await req.text();

  const response = await fetch(newUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: req.headers.get('cookie') || '',
    },
    body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'text/plain',
    },
  });
}
