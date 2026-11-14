import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchUpstream, getCache, setCache } from '@/lib/fetch-utils';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const params = new URL(req.url).searchParams;
  const id = params.get('id') || '';
  const kind = params.get('type') === 'tv' ? 'tv' : 'movie';
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const key = `douban-extras:${kind}:${id}`;
  const cached = getCache<unknown>(key);
  if (cached) return NextResponse.json(cached, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  const headers = { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', Referer: 'https://m.douban.com/', Accept: 'application/json' };
  const get = async (path: string) => {
    try {
      const res = await fetchUpstream(`https://m.douban.com/rexxar/api/v2/${kind}/${id}/${path}`, { timeoutMs: 6000, headers });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  };
  const [credits, recommendations] = await Promise.all([get('celebrities'), get('recommendations')]);
  const people: { name: string; role: string; photo?: string }[] = [];
  for (const [key, role] of [['directors', '导演'], ['actors', '演员']] as const) {
    if (!Array.isArray(credits?.[key])) continue;
    for (const person of credits[key].slice(0, 6)) {
      if (typeof person?.name !== 'string') continue;
      const photo = person.avatar?.large || person.avatar?.normal;
      people.push({ name: person.name, role, photo: typeof photo === 'string' && /^https:\/\//.test(photo) ? photo : undefined });
    }
  }
  const items = (Array.isArray(recommendations) ? recommendations : []).slice(0, 20).flatMap((x: { id?: unknown; title?: unknown; pic?: { normal?: unknown; large?: unknown }; rating?: { value?: unknown }; type?: unknown }) => {
    const cover = x.pic?.normal || x.pic?.large;
    if (typeof x.id !== 'string' || !/^\d+$/.test(x.id) || x.id === id || typeof x.title !== 'string' || typeof cover !== 'string' || !/^https:\/\//.test(cover)) return [];
    return [{ id: x.id, title: x.title, cover, rating: typeof x.rating?.value === 'number' && x.rating.value > 0 ? x.rating.value.toFixed(1) : undefined, isTv: x.type === 'tv' }];
  });
  const result = { people, items };
  if (credits || recommendations) setCache(key, result, 60 * 60 * 1000);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=3600' } });
}
