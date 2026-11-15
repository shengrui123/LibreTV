import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
export const EMBY_COOKIE = 'ltv_emby';
export interface EmbySession { base: string; token: string; user: string; name: string; expires: number }
const key = () => createHash('sha256').update((process.env.PROXY_SECRET || process.env.PASSWORD || '') + ':emby-session-v1').digest();
export function sealEmby(session: EmbySession) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}
export function openEmby(value: string): EmbySession | null {
  try {
    const data = Buffer.from(value, 'base64url');
    const cipher = createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    const session = JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString()) as EmbySession;
    return session.expires > Date.now() ? session : null;
  } catch { return null; }
}
