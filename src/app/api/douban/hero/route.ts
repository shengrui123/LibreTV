import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchDoubanHero } from '@/lib/douban';

export const runtime = 'nodejs';
export const maxDuration = 30;

/** 首页 Hero：有高清剧照的今日热门（单请求聚合，服务端限流友好） */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const type = new URL(req.url).searchParams.get('type') === 'tv' ? 'tv' : 'movie';
  try {
    const entries = await fetchDoubanHero(type);
    return NextResponse.json(
      { entries },
      // 公开的豆瓣数据：允许 Vercel CDN 缓存 30 分钟并在后台刷新，首屏几乎瞬时返回
      { headers: { 'Cache-Control': entries.length ? 'public, s-maxage=1800, stale-while-revalidate=86400' : 'no-store' } }
    );
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '获取失败' }, { status: 502 });
  }
}
