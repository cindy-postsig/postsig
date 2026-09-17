export function randomBytes(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export async function sha256Hash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function randomInt(min: number, max: number): number {
  const range = max - min;
  const maxValid = Math.floor(2 ** 32 / range) * range;
  const bytes = new Uint8Array(4);
  let randomValue: number;
  do {
    crypto.getRandomValues(bytes);
    randomValue =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  } while (randomValue >= maxValid);
  return min + (randomValue % range);
}
