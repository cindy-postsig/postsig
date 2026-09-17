import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { randomBytes } from 'node:crypto';

const KEY_ENV = 'MCP_TOKEN_ENCRYPTION_KEY';
const prevKey = process.env[KEY_ENV];

beforeAll(() => {
  process.env[KEY_ENV] = randomBytes(32).toString('base64');
});

afterAll(() => {
  if (prevKey === undefined) delete process.env[KEY_ENV];
  else process.env[KEY_ENV] = prevKey;
});

async function loadFresh() {
  jest.resetModules();
  return import('@/app/lib/mcp/token-storage');
}

describe('token-storage', () => {
  it('round-trips arbitrary plaintext', async () => {
    const { encryptTokenPlaintext, decryptTokenCiphertext } = await loadFresh();
    const plaintext = `postsig_mcp_${randomBytes(32).toString('base64url')}`;
    const ct = encryptTokenPlaintext(plaintext);
    expect(ct).not.toBe(plaintext);
    expect(decryptTokenCiphertext(ct)).toBe(plaintext);
  });

  it('produces a different ciphertext each call (random IV)', async () => {
    const { encryptTokenPlaintext } = await loadFresh();
    const a = encryptTokenPlaintext('same input');
    const b = encryptTokenPlaintext('same input');
    expect(a).not.toBe(b);
  });

  it('throws when the ciphertext has been tampered with', async () => {
    const { encryptTokenPlaintext, decryptTokenCiphertext } = await loadFresh();
    const ct = encryptTokenPlaintext('secret');
    const buf = Buffer.from(ct, 'base64');
    // Flip a byte inside the ciphertext region (past iv + authTag).
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString('base64');
    expect(() => decryptTokenCiphertext(tampered)).toThrow();
  });

  it('throws when the key is missing', async () => {
    const saved = process.env[KEY_ENV];
    delete process.env[KEY_ENV];
    try {
      const { encryptTokenPlaintext } = await loadFresh();
      expect(() => encryptTokenPlaintext('x')).toThrow(/not set/i);
    } finally {
      process.env[KEY_ENV] = saved;
    }
  });

  it('throws when the key is the wrong length', async () => {
    const saved = process.env[KEY_ENV];
    process.env[KEY_ENV] = Buffer.from('too short').toString('base64');
    try {
      const { encryptTokenPlaintext } = await loadFresh();
      expect(() => encryptTokenPlaintext('x')).toThrow(/32 bytes/);
    } finally {
      process.env[KEY_ENV] = saved;
    }
  });
});
