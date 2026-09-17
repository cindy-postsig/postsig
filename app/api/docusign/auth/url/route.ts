import { NextResponse } from 'next/server';
import logger from '@/utils/pino';

export async function POST(request: Request) {
  const baseUrl = process.env.DOCUSIGN_OAUTH_BASE_URL;
  const clientId = process.env.DOCUSIGN_CLIENT_ID;
  const redirectUri = process.env.DOCUSIGN_REDIRECT_URI;
  try {
    const body = await request.json();
    const returnUrl = body.returnUrl || '/settings/integrations';

    const scope = 'signature';
    const responseType = 'code';

    if (!clientId || !redirectUri) {
      logger.info({ clientId, redirectUri });
      return NextResponse.json(
        { error: 'DocuSign integration is not configured' },
        { status: 500 },
      );
    }

    const authUrl = new URL(`${baseUrl}/oauth/auth`);
    authUrl.searchParams.append('response_type', responseType);
    authUrl.searchParams.append('scope', scope);
    authUrl.searchParams.append('client_id', clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('prompt', 'login'); // Force login prompt every time

    // Create a state parameter that includes return URL information
    // Format: random_string.base64_encoded_return_url
    const randomState = Math.random().toString(36).substring(2, 15);
    const encodedReturnUrl = Buffer.from(returnUrl).toString('base64');
    const state = `${randomState}.${encodedReturnUrl}`;

    authUrl.searchParams.append('state', state);

    logger.info(
      `Generated DocuSign auth URL: ${authUrl.toString()} with return path: ${returnUrl}`,
    );
    return NextResponse.json({ url: authUrl.toString() });
  } catch (error) {
    logger.error({ error }, 'Error generating DocuSign auth URL');
    return NextResponse.json(
      { error: 'Failed to generate authorization URL' },
      { status: 500 },
    );
  }
}
