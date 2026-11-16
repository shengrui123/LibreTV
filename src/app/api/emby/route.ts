import { NextRequest, NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchWithSafeRedirects, fetchUpstream } from '@/lib/fetch-utils';
import { EMBY_COOKIE, openEmby, sealEmby, type EmbySession } from '@/lib/emby-session';
import { embyMediaUrl, selectEmbyPlayback, browserEmbyProfile, playbackDiagnostics, EMBY_DEVICE_ID } from '@/lib/emby-playback';
import { splitSeason } from '@/lib/tmdb-series';
export const runtime = 'nodejs';
const authorization = 'Emby Client="LibreTV", Device="Web", DeviceId="libretv-web", Version="1.0"';
interface Item { Id: string; Name: string; Type: string; IndexNumber?: number; ParentIndexNumber?: number; MediaSources?: { Id: string }[] }
async function get(session: EmbySession, path: string, params: Record<string, string> = {}) {
  const response = await fetchUpstream(`${session.base}/${path}?${new URLSearchParams(params)}`, { headers: { 'X-Emby-Token': session.token }, timeoutMs: 12000, retries: 0, redirect: 'error', safeRedirects: false });
  if (!response.ok) throw new Error(response.status === 401 ? 'Emby 登录已失效，请重新登录' : 'Emby 请求失败');
  return response.json();
}
export async function POST(req: NextRequest) {
  const denied = guardRequest(req); if (denied) return denied;
  try {
    const { url, username, password, libraryName = '', notes = '' } = await req.json();
    if (typeof libraryName !== 'string' || libraryName.length > 80 || typeof notes !== 'string' || notes.length > 300) throw new Error('名称或备注过长');
    if (typeof url !== 'string' || typeof username !== 'string' || typeof password !== 'string' || url.length > 1000 || username.length > 200 || password.length > 1000) throw new Error('请填写服务器地址、用户名和密码');
    const base = new URL(url.trim());
    if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('请填写有效的 Emby 地址');
    base.search = ''; base.hash = '';
    const root = base.toString().replace(/\/+$/, '');
    const response = await fetchUpstream(`${root}/Users/AuthenticateByName`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emby-Authorization': authorization }, body: JSON.stringify({ Username: username, Pw: password }), timeoutMs: 12000, retries: 0, redirect: 'error', safeRedirects: false });
    if (!response.ok) throw new Error('登录失败，请检查地址和账号密码');
    const data = await response.json();
    if (!data.AccessToken || !data.User?.Id) throw new Error('Emby 登录响应无效');
    const result = NextResponse.json({ connected: true, name: libraryName || data.User.Name || username });
    result.cookies.set(EMBY_COOKIE, sealEmby({ base: root, token: data.AccessToken, user: data.User.Id, name: libraryName || data.User.Name || username, notes, expires: Date.now() + 7 * 86400000 }), { httpOnly: true, secure: req.nextUrl.protocol === 'https:', sameSite: 'strict', path: '/api/emby', maxAge: 7 * 86400 });
    return result;
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '连接失败' }, { status: 400 }); }
}
export async function DELETE(req: NextRequest) {
  const denied = guardRequest(req); if (denied) return denied;
  const result = NextResponse.json({ connected: false }); result.cookies.set(EMBY_COOKIE, '', { path: '/api/emby', maxAge: 0 }); return result;
}
export async function GET(req: NextRequest) {
  const denied = guardRequest(req); if (denied) return denied;
  const session = openEmby(req.cookies.get(EMBY_COOKIE)?.value || '');
  const params = req.nextUrl.searchParams;
  if (!session) return NextResponse.json({ connected: false, error: '请先登录 Emby' }, { status: params.size ? 409 : 200 });
  try {
    const id = params.get('id');
    if (id) {
      if (!/^[\w-]+(?::\d+)?$/.test(id)) throw new Error('无效资源');
      const [itemId, season = '1'] = id.split(':');
      const item: Item = await get(session, `Users/${encodeURIComponent(session.user)}/Items/${itemId}`);
      const items: Item[] = item.Type === 'Series' ? (await get(session, `Shows/${itemId}/Episodes`, { UserId: session.user, Season: season, Fields: 'MediaSources' })).Items : [item];
      const sorted = items.slice().sort((a,b) => (a.ParentIndexNumber || 0) - (b.ParentIndexNumber || 0) || (a.IndexNumber || 0) - (b.IndexNumber || 0));
      return NextResponse.json({ episodes: sorted.map((entry) => `/api/emby?stream=${encodeURIComponent(entry.Id)}`), episodeNames: sorted.map((entry) => entry.Type === 'Episode' ? `第 ${entry.IndexNumber} 集 · ${entry.Name}` : entry.Name), videoInfo: { title: item.Name, sourceKey: 'emby', sourceName: 'Emby' } }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const media = params.get('media');
    if (media) {
      const ticket = openEmby(media);
      if (!ticket?.target || ticket.token !== session.token || ticket.user !== session.user || ticket.base !== session.base) throw new Error('播放地址已失效，请重新选择 Emby 资源');
      const { res, finalUrl } = await fetchWithSafeRedirects(ticket.target, { headers: req.headers.get('range') ? { Range: req.headers.get('range')! } : {}, signal: req.signal }, { headerTimeoutMs: 20000 });
      if (!res.ok && res.status !== 416) { await res.body?.cancel(); throw new Error(`Emby 视频流请求失败（${res.status}），请检查播放权限和服务器连接`); }
      const headers = new Headers({ 'Cache-Control': 'no-store' });
      const playlist = /mpegurl/i.test(res.headers.get('content-type') || '') || /\.m3u8(?:[?]|$)/i.test(finalUrl);
      if (playlist) {
        const rewrite = (uri: string) => {
          const target = new URL(uri, finalUrl);
          if (target.origin === new URL(session.base).origin && !target.searchParams.has('api_key')) target.searchParams.set('api_key', session.token);
          return embyMediaUrl(session, target.href);
        };
        const text = (await res.text()).split('\n').map((line) => {
          if (!line.trim()) return line;
          if (line.startsWith('#')) return line.replace(/URI="([^"\n]+)"/g, (_, uri: string) => `URI="${rewrite(uri)}"`);
          return rewrite(line.trim());
        }).join('\n');
        headers.set('Content-Type', 'application/vnd.apple.mpegurl');
        return new NextResponse(text, { headers });
      }
      for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const value = res.headers.get(name); if (value) headers.set(name, value); }
      return new NextResponse(res.body, { status: res.status, headers });
    }
    const stream = params.get('stream');
    if (stream) {
      if (!/^[\w-]+$/.test(stream)) throw new Error('无效资源');
      const compatible = params.get('compatible') === '1';
      const profile = browserEmbyProfile(params.get('hevc') === '1', params.get('ac3') === '1', params.get('eac3') === '1', { av1: params.get('av1') === '1', vp9: params.get('vp9') === '1', vp8: params.get('vp8') === '1', opus: params.get('opus') === '1', vorbis: params.get('vorbis') === '1', webm: params.get('webm') === '1', ogg: params.get('ogg') === '1' });
      if (compatible) profile.DirectPlayProfiles = [];
      const response = await fetchUpstream(`${session.base}/Items/${stream}/PlaybackInfo?${new URLSearchParams({ UserId: session.user, DeviceId: EMBY_DEVICE_ID })}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Emby-Token': session.token, 'X-Emby-Authorization': authorization }, body: JSON.stringify({ UserId: session.user, IsPlayback: true, AutoOpenLiveStream: true, MaxStreamingBitrate: 20000000, MaxAudioChannels: 2, EnableDirectPlay: !compatible, EnableDirectStream: true, EnableTranscoding: true, AllowVideoStreamCopy: true, AllowAudioStreamCopy: true, DeviceProfile: profile }), timeoutMs: 15000, retries: 0, redirect: 'error', safeRedirects: false });
      if (!response.ok) throw new Error(`Emby 播放协商失败（${response.status}），请检查账号播放权限`);
      const data = await response.json();
      let playback;
      try { playback = selectEmbyPlayback(session, stream, data, compatible); }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Emby 播放协商失败', diagnostics: playbackDiagnostics(data) }, { status: 422, headers: { 'Cache-Control': 'no-store' } }); }
      if (params.has('resolve')) return NextResponse.json({ ...playback, diagnostics: playbackDiagnostics(data) }, { headers: { 'Cache-Control': 'no-store' } });
      return new NextResponse(null, { status: 302, headers: { Location: playback.url, 'Cache-Control': 'no-store' } });
    }
    const title = params.get('title');
    if (!title) return NextResponse.json({ connected: true, name: session.name, url: session.base, notes: session.notes || '' }, { headers: { 'Cache-Control': 'no-store' } });
    if (title.length > 200) throw new Error('片名过长');
    const { base, season } = splitSeason(title);
    const data = await get(session, `Users/${encodeURIComponent(session.user)}/Items`, { SearchTerm: base, IncludeItemTypes: 'Movie,Series', Recursive: 'true', Limit: '30' });
    const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    const items = (data.Items as Item[] || []).filter((item) => normalize(item.Name) === normalize(base) || normalize(item.Name) === normalize(title));
    return NextResponse.json({ items: items.map((item) => ({ id: item.Type === 'Series' ? `${item.Id}:${season}` : item.Id, name: item.Name, type: item.Type === 'Series' ? `第 ${season} 季` : '电影' })) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Emby 请求失败' }, { status: 400 }); }
}
