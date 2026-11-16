import { NextRequest, NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchWithSafeRedirects, fetchUpstream } from '@/lib/fetch-utils';
import { EMBY_COOKIE, openEmby, sealEmby, type EmbySession } from '@/lib/emby-session';
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
    const stream = params.get('stream');
    if (stream) {
      if (!/^[\w-]+$/.test(stream)) throw new Error('无效资源');
      const item: Item = await get(session, `Users/${encodeURIComponent(session.user)}/Items/${stream}`, { Fields: 'MediaSources' });
      const query = new URLSearchParams({ Static: 'true', api_key: session.token, MediaSourceId: item.MediaSources?.[0]?.Id || stream, PlaySessionId: crypto.randomUUID() });
      const target = `${session.base}/Videos/${stream}/stream?${query}`;
      if (session.base.startsWith('http:')) {
        const { res } = await fetchWithSafeRedirects(target, { headers: req.headers.get('range') ? { Range: req.headers.get('range')! } : {}, signal: req.signal }, { headerTimeoutMs: 15000 });
        const headers = new Headers({ 'Cache-Control': 'no-store' });
        for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) { const value = res.headers.get(name); if (value) headers.set(name, value); }
        return new NextResponse(res.body, { status: res.status, headers });
      }
      return new NextResponse(null, { status: 302, headers: { Location: target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } });
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
