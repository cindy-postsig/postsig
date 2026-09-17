import { createVertex } from '@ai-sdk/google-vertex';
import logger from '@/utils/pino';
import { ValidationError } from '../errors';

let google: ReturnType<typeof createVertex> | undefined;

export function getVertexAI(): ReturnType<typeof createVertex> | undefined {
  if (google) return google;

  const credentialsBuffer = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsBuffer) {
    logger.warn('GOOGLE_APPLICATION_CREDENTIALS not set');
    throw new ValidationError('GOOGLE_APPLICATION_CREDENTIALS not set');
  }

  try {
    const credentialsParsed = JSON.parse(
      Buffer.from(credentialsBuffer, 'base64').toString('utf-8'),
    );
    google = createVertex({
      googleAuthOptions: { credentials: credentialsParsed },
      project: process.env.GOOGLE_CLOUD_PROJECT,
      location: 'global',
    });
    return google;
  } catch (e) {
    logger.error({ error: e }, 'Failed to parse Google credentials');
    throw new ValidationError('Failed to parse Google credentials');
  }
}

export const DEFAULT_MODEL_ID =
  process.env.GOOGLE_VERTEX_MODEL_ID || 'gemini-3-flash-preview';
