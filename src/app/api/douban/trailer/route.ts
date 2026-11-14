import { guardRequest } from '@/lib/api-guard';
import { fetchUpstream } from '@/lib/fetch-utils';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const guarded = guardRequest(req);
  if (guarded) return guarded;
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^\d{1,12}$/.test(id)) return new Response('无效的预告片', { status: 400 });
  try {
    const page = await fetchUpstream(`https://movie.douban.com/trailer/${id}/`, {
      timeoutMs: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://movie.douban.com/' },
    });
    if (!page.ok) throw new Error('预告片不可用');
    const html = await page.text();
    const urls = [...new Set(html.match(/https:\/\/vt\d+\.doubanio\.com\/[^\s"'<>]+\.mp4/g) || [])];
    const range = req.headers.get('range');
    if (range && !/^bytes=\d*-\d*$/.test(range)) return new Response('无效的播放范围', { status: 416 });
    for (const url of urls.slice(0, 3)) {
      const response = await fetch(url, {
        headers: { Referer: 'https://movie.douban.com/', 'User-Agent': 'Mozilla/5.0', ...(range ? { Range: range } : {}) },
        redirect: 'error', signal: req.signal,
      }).catch(() => null);
      if (!response?.ok || !response.body) continue;
      const headers = new Headers({ 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' });
      for (const name of ['content-length', 'content-range']) {
        const value = response.headers.get(name);
        if (value) headers.set(name, value);
      }
      return new Response(response.body, { status: response.status, headers });
    }
  } catch { /* 返回统一的不可用提示 */ }
  return new Response('预告片暂不可用', { status: 502 });
}
