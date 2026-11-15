import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchUpstream } from '@/lib/fetch-utils';

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const params = new URL(req.url).searchParams;
  const title = params.get('title')?.trim() || '';
  const year = params.get('year') || '';
  if (!title || title.length > 200) return NextResponse.json({ item: null });
  try {
    const response = await fetchUpstream(`https://movie.douban.com/j/subject_suggest?${new URLSearchParams({ q: title })}`, { timeoutMs: 6000, headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://movie.douban.com/' }, safeRedirects: false, redirect: 'error' });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json() as { id: string; title: string; year?: string; img?: string; type?: string }[];
    const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
    const matches = data.filter((item) => /^\d{1,12}$/.test(item.id) && item.type === 'movie' && normalize(item.title) === normalize(title) && (!year || item.year === year));
    const match = matches.length === 1 ? matches[0] : null;
    return NextResponse.json({ item: match ? { id: match.id, title: match.title, cover: match.img || '' } : null }, { headers: { 'Cache-Control': 'public, s-maxage=3600' } });
  } catch { return NextResponse.json({ item: null }, { headers: { 'Cache-Control': 'no-store' } }); }
}
