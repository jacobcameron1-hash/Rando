import { randomBytes } from 'crypto';

export function nanoid(size = 21): string {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const bytes = randomBytes(size);
  return Array.from(bytes)
    .map((b) => alphabet[b % alphabet.length])
    .join('');
}
