/**
 * Vault keypair management.
 *
 * Each Rando project gets a unique Solana keypair. The vault receives fee
 * share allocations and holds the prize pool. Private keys are AES-256-GCM
 * encrypted with the server's VAULT_ENCRYPTION_KEY before being stored in DB.
 */

import { Keypair } from '@solana/web3.js';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // bytes

function getEncryptionKey(): Buffer {
  const key = process.env.VAULT_ENCRYPTION_KEY;
  if (!key) throw new Error('VAULT_ENCRYPTION_KEY env var is not set');
  const buf = Buffer.from(key, 'hex');
  if (buf.length !== KEY_LENGTH) {
    throw new Error('VAULT_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return buf;
}

/**
 * Generate a fresh Solana keypair for a new project vault.
 */
export function generateVaultKeypair(): Keypair {
  return Keypair.generate();
}

/**
 * Import a keypair from a secret key byte array (e.g. exported from Phantom/Solflare).
 * Accepts a 64-byte Uint8Array or plain number[] as exported by most Solana wallets.
 */
export function keypairFromSecretKeyArray(secretKeyArray: number[]): Keypair {
  if (!Array.isArray(secretKeyArray) || secretKeyArray.length !== 64) {
    throw new Error('Invalid secret key: expected a 64-element byte array');
  }
  return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
}

/**
 * Encrypt a keypair's secret key for DB storage.
 * Returns a hex string: iv(24) + authTag(32) + ciphertext
 */
export function encryptKeypair(keypair: Keypair): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const secretKeyJson = JSON.stringify(Array.from(keypair.secretKey));
  const encrypted = Buffer.concat([
    cipher.update(secretKeyJson, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12 bytes) + authTag (16 bytes) + ciphertext
  return Buffer.concat([iv, authTag, encrypted]).toString('hex');
}

/**
 * Decrypt a stored vault keypair back to a usable Keypair.
 */
export function decryptKeypair(encrypted: string): Keypair {
  const key = getEncryptionKey();
  const buf = Buffer.from(encrypted, 'hex');
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ciphertext = buf.subarray(28);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  const secretKeyArray: number[] = JSON.parse(decrypted.toString('utf8'));
  return Keypair.fromSecretKey(Uint8Array.from(secretKeyArray));
}
