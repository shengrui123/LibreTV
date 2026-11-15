import { afterEach, describe, expect, it, vi } from 'vitest';
import { openEmby, sealEmby } from './emby-session';
afterEach(() => vi.unstubAllEnvs());
describe('Emby session', () => {
  it('encrypts credentials and rejects tampering, expiry and a different signing secret', () => {
    vi.stubEnv('PASSWORD', 'test'); vi.stubEnv('PROXY_SECRET', '');
    const session = { base: 'https://example.com', token: 'private-token', user: 'user', name: 'Name', expires: Date.now() + 10000 };
    const sealed = sealEmby(session);
    expect(sealed).not.toContain('private-token');
    expect(openEmby(sealed)).toEqual(session);
    expect(openEmby((sealed[0] === 'A' ? 'B' : 'A') + sealed.slice(1))).toBeNull();
    expect(openEmby(sealEmby({ ...session, expires: Date.now() - 1 }))).toBeNull();
    vi.stubEnv('PASSWORD', 'changed'); expect(openEmby(sealed)).toBeNull();
  });
});
