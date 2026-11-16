import { NextResponse } from 'next/server';
import { guardRequest } from '@/lib/api-guard';
import { fetchWithSafeRedirects, getCache, setCache } from '@/lib/fetch-utils';
import { mediaFormat, type MediaFormat } from '@/lib/media-format';
export async function GET(req: Request) {
  const denied = guardRequest(req); if (denied) return denied;
  const url = new URL(req.url).searchParams.get('url') || '';
  if (url.length > 8192 || !/^https?:\/\//i.test(url)) return NextResponse.json({ error: '无效媒体地址' }, { status: 400 });
  const key = `media-format:${url}`;
  const cached = getCache<MediaFormat>(key);
  if (cached) return NextResponse.json({ format: cached }, { headers: { 'Cache-Control': 'no-store' } });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const { res, finalUrl } = await fetchWithSafeRedirects(url, { headers: { Range: 'bytes=0-4095' }, signal: controller.signal }, { headerTimeoutMs: 8000 });
    if (!res.ok || !res.body) { await res.body?.cancel(); throw new Error('无法读取媒体头'); }
    const reader = res.body.getReader();
    const buffer = new Uint8Array(4096); let length = 0;
    try {
      while (length < buffer.length) {
        const { value, done } = await reader.read(); if (done) break;
        const chunk = value.subarray(0, buffer.length - length); buffer.set(chunk, length); length += chunk.length;
      }
    } finally { await reader.cancel(); }
    const format = mediaFormat(finalUrl, res.headers.get('content-type') || '', buffer.subarray(0, length));
    if (format !== 'unknown') setCache(key, format, 5 * 60_000);
    return NextResponse.json({ format }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ format: 'unknown' }, { headers: { 'Cache-Control': 'no-store' } }); }
  finally { clearTimeout(timer); }
}
