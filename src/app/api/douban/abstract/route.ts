import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchDoubanAbstract } from '@/lib/douban';

export const runtime = 'nodejs';

/** 豆瓣条目摘要：首页 Hero 展示类型、年份、演员与短评 */
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    return NextResponse.json(await fetchDoubanAbstract(id), {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '获取失败' }, { status: 502 });
  }
}
