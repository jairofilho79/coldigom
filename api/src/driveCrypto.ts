/** AES-GCM helpers for storing Google refresh tokens at rest. */

function b64encode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str);
}

function b64decode(b64: string): Uint8Array {
  const str = atob(b64);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Encrypt plaintext → `ivB64:cipherB64` */
export async function encryptSecret(secret: string, plaintext: string): Promise<string> {
  const key = await deriveAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${b64encode(iv)}:${b64encode(new Uint8Array(cipher))}`;
}

export async function decryptSecret(secret: string, payload: string): Promise<string> {
  const [ivB64, cipherB64] = payload.split(':');
  if (!ivB64 || !cipherB64) throw new Error('Invalid encrypted payload');
  const key = await deriveAesKey(secret);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64decode(ivB64) },
    key,
    b64decode(cipherB64)
  );
  return new TextDecoder().decode(plain);
}
