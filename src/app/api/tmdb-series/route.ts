import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchSeriesMetadata } from '@/lib/tmdb-series';
export const runtime = 'nodejs';
export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const params = new URL(req.url).searchParams;
  const title = params.get('title')?.trim() || '';
  const year = params.get('year') || '';
  const selected = params.has('season') ? Number(params.get('season')) : undefined;
  if (!title || title.length > 200 || (year && !/^\d{4}$/.test(year)) || (selected !== undefined && (!Number.isInteger(selected) || selected < 1 || selected > 200))) return NextResponse.json(null, { status: 400 });
  try { return NextResponse.json(await fetchSeriesMetadata(title, year, selected), { headers: { 'Cache-Control': 'private, max-age=3600' } }); }
  catch { return NextResponse.json(null, { headers: { 'Cache-Control': 'no-store' } }); }
}
