// ───────────────────────────────────────────────────────────────────────────
//  Encrypted storage for OAuth tokens (8.2). Tokens are sealed with
//  AES-256-GCM under a key derived (scrypt) from HOARD_SECRET, so a database
//  dump alone never reveals them, and any change to a stored value fails the
//  GCM tag check instead of decrypting to garbage. Without HOARD_SECRET (or
//  with one shorter than 32 characters) nothing is ever stored: the OAuth
//  features say so instead (spec G4/G5). Plaintext tokens are never written.
//
//  Server-only (node:crypto). Format: "v1.<iv>.<tag>.<ciphertext>" (base64url).
// ───────────────────────────────────────────────────────────────────────────

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export const MIN_SECRET_LENGTH = 32;
const SALT = 'hoard-secret-box-v1';
const keys = new Map<string, Buffer>();

/** True when HOARD_SECRET is set and long enough. */
export function secretConfigured(secret = process.env.HOARD_SECRET): boolean {
  return typeof secret === 'string' && secret.length >= MIN_SECRET_LENGTH;
}

function keyFor(secret: string): Buffer {
  let key = keys.get(secret);
  if (!key) {
    key = scryptSync(secret, SALT, 32);
    keys.set(secret, key);
  }
  return key;
}

function requireSecret(secret: string | undefined): string {
  if (!secretConfigured(secret)) throw new Error('HOARD_SECRET is not configured (32+ characters).');
  return secret!;
}

/** Encrypt a token. Throws when HOARD_SECRET is missing. */
export function sealToken(plain: string, secret = process.env.HOARD_SECRET): string {
  const key = keyFor(requireSecret(secret));
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), body.toString('base64url')].join('.');
}

/**
 * Decrypt a sealed token. Null when the secret is missing or changed, the
 * value is malformed, or it was tampered with (the GCM tag doesn't verify).
 */
export function openToken(sealed: string | null | undefined, secret = process.env.HOARD_SECRET): string | null {
  if (!sealed || !secretConfigured(secret)) return null;
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const tag = Buffer.from(parts[2], 'base64url');
    const body = Buffer.from(parts[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', keyFor(secret!), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
