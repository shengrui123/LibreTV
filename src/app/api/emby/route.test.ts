import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { EMBY_COOKIE, sealEmby } from '@/lib/emby-session';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), guard: vi.fn() }));
vi.mock('@/lib/fetch-utils', () => ({ fetchUpstream: mocks.fetch }));
vi.mock('@/lib/api-guard', () => ({ guardRequest: mocks.guard }));
beforeEach(() => { mocks.fetch.mockReset(); mocks.guard.mockReturnValue(null); });
const cookie = () => `${EMBY_COOKIE}=${sealEmby({ base: 'https://emby.example', token: 'private-token', user: 'u1', name: 'User', expires: Date.now() + 100000 })}`;
describe('playback-only Emby integration', () => {
  it('returns connection status without browsing the media library', async () => {
    const response = await GET(new NextRequest('https://local/api/emby', { headers: { cookie: cookie() } }));
    expect(await response.json()).toEqual({ connected: true, name: 'User' });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('requires an Emby login before querying', async () => {
    expect((await GET(new NextRequest('https://local/api/emby?title=Example'))).status).toBe(409);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('only returns exact title matches and keeps tokens off search responses', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ Items: [{ Id: '1', Name: 'Example', Type: 'Movie' }, { Id: '2', Name: 'Example sequel', Type: 'Movie' }] }));
    const response = await GET(new NextRequest('https://local/api/emby?title=Example', { headers: { cookie: cookie() } }));
    expect(await response.json()).toEqual({ items: [{ id: '1', name: 'Example', type: '电影' }] });
  });
  it('stores a login token in an HttpOnly cookie without returning it or storing the password', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ AccessToken: 'secret', User: { Id: 'u1', Name: 'User' } }));
    const response = await POST(new NextRequest('https://local/api/emby', { method: 'POST', body: JSON.stringify({ url: 'https://emby.example', username: 'User', password: 'password' }) }));
    expect(await response.json()).toEqual({ connected: true, name: 'User' });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).not.toContain('secret');
  });
});
