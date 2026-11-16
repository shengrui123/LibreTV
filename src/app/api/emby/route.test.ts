import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from './route';
import { embyMediaUrl } from '@/lib/emby-playback';
import { EMBY_COOKIE, sealEmby } from '@/lib/emby-session';
const mocks = vi.hoisted(() => ({ stream: vi.fn(), fetch: vi.fn(), guard: vi.fn() }));
vi.mock('@/lib/fetch-utils', () => ({ fetchUpstream: mocks.fetch, fetchWithSafeRedirects: mocks.stream }));
vi.mock('@/lib/api-guard', () => ({ guardRequest: mocks.guard }));
beforeEach(() => { mocks.fetch.mockReset(); mocks.stream.mockReset(); mocks.guard.mockReturnValue(null); });
const cookie = () => `${EMBY_COOKIE}=${sealEmby({ base: 'https://emby.example', token: 'private-token', user: 'u1', name: 'User', expires: Date.now() + 100000 })}`;
describe('playback-only Emby integration', () => {
  it('returns connection status without browsing the media library', async () => {
    const response = await GET(new NextRequest('https://local/api/emby', { headers: { cookie: cookie() } }));
    expect(await response.json()).toMatchObject({ connected: true, name: 'User' });
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
  it('keeps custom library names and notes in the encrypted connection', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ AccessToken: 'secret', User: { Id: 'u1', Name: 'User' } }));
    const response = await POST(new NextRequest('https://local/api/emby', { method: 'POST', body: JSON.stringify({ url: 'http://emby.example:8096/emby', username: 'User', password: '', libraryName: '家庭资源库', notes: '账号备注' }) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ name: '家庭资源库' });
    const status = await GET(new NextRequest('https://local/api/emby', { headers: { cookie: `${EMBY_COOKIE}=${response.cookies.get(EMBY_COOKIE)!.value}` } }));
    expect(await status.json()).toMatchObject({ connected: true, name: '家庭资源库', url: 'http://emby.example:8096/emby', notes: '账号备注' });
  });
  it('rewrites HLS playlists so segments and keys retain Emby authentication', async () => {
    const session = { base: 'https://emby.example', token: 'private-token', user: 'u1', name: 'User', expires: Date.now() + 100000 };
    const url = embyMediaUrl(session, 'https://emby.example/videos/1/master.m3u8', 'hls');
    mocks.stream.mockResolvedValue({ res: new Response('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\nsegment.ts\n', { headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }), finalUrl: 'https://emby.example/videos/1/master.m3u8' });
    const response = await GET(new NextRequest('https://local' + url, { headers: { cookie: cookie() } }));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).toContain('URI="/api/emby?media=');
    expect(text).not.toContain('private-token');
    expect(text).not.toContain('\nsegment.ts');
  });
  it('stores a login token in an HttpOnly cookie without returning it or storing the password', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ AccessToken: 'secret', User: { Id: 'u1', Name: 'User' } }));
    const response = await POST(new NextRequest('https://local/api/emby', { method: 'POST', body: JSON.stringify({ url: 'https://emby.example', username: 'User', password: 'password' }) }));
    expect(await response.json()).toMatchObject({ connected: true, name: 'User' });
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    expect(response.headers.get('set-cookie')).not.toContain('secret');
  });
});
