import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchTrending } from '@/lib/tmdb-trending';
export async function GET(req: Request) {
  const denied = guardRequest(req); if (denied) return denied;
  const id = new URL(req.url).searchParams.get('id') || undefined;
  if (id && !/^tmdb-(movie|tv)-\d{1,12}$/.test(id)) return NextResponse.json({ error: '无效条目' }, { status: 400 });
  try { return NextResponse.json({ entries: await fetchTrending(id) }, { headers: { 'Cache-Control': 'private, max-age=1800' } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : '获取失败' }, { status: 502 }); }
}
