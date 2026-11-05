import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for the Apple refresh tokens kept for revocation (apple_auth_tokens, apple_revocation_pending), with
 * a key that lives only in the server environment (APPLE_TOKEN_ENCRYPTION_KEY: 32 random bytes, base64). A database
 * dump or a leaked backup then holds no usable Apple grant.
 *
 * Stored form: `v1:` + base64(12-byte nonce | ciphertext | 16-byte tag). A value without the prefix was stored before
 * sealing existed and is returned as is, so turning the key on needs no data migration. Without a key nothing is
 * sealed (the previous behaviour), and a sealed value cannot be opened, which fails loudly.
 */
const PREFIX = "v1:";

function keyBytes(keyB64: string): Buffer {
  const key = Buffer.from(keyB64, "base64");
  if (key.length !== 32) throw new Error("APPLE_TOKEN_ENCRYPTION_KEY must be 32 bytes (base64)");
  return key;
}

export function appleTokenKey(): string | undefined {
  const key = process.env.APPLE_TOKEN_ENCRYPTION_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

export function sealToken(plain: string, keyB64: string | undefined = appleTokenKey()): string {
  if (!keyB64) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(keyB64), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64");
}

export function openToken(stored: string, keyB64: string | undefined = appleTokenKey()): string {
  if (!stored.startsWith(PREFIX)) return stored;
  if (!keyB64) throw new Error("A sealed Apple token needs APPLE_TOKEN_ENCRYPTION_KEY to open");
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(raw.length - 16);
  const body = raw.subarray(12, raw.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(keyB64), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}
