import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchTmdbHero } from '@/lib/tmdb-hero';

export const runtime = 'nodejs';
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^\d{1,12}$/.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const result = await fetchTmdbHero(id);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, max-age=3600' } });
  } catch {
    return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } });
  }
}
