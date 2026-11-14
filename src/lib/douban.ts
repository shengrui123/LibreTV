import type { DoubanItem, DoubanAbstract } from './types';
import { fetchUpstream, getCache, setCache } from './fetch-utils';

/**
 * 豆瓣推荐数据获取（服务端直连，带内存缓存与降级链）。
 * 旧版在浏览器里经公共 CORS 代理请求豆瓣（隐私差且不稳定），
 * 重构后由服务端直连，仅在直连被拒时降级到公共代理。
 */

const DOUBAN_API = 'https://movie.douban.com/j/search_subjects';
const CACHE_TTL = 10 * 60 * 1000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

interface DoubanRawSubject {
  id: string;
  title: string;
  cover: string;
  rate: string;
  url?: string;
}

function fallbackProxies(): string[] {
  const proxies: string[] = [];
  if (process.env.FALLBACK_CORS_PROXY) proxies.push(process.env.FALLBACK_CORS_PROXY);
  return proxies;
}

export async function fetchDoubanRecommend(
  type: 'movie' | 'tv',
  tag: string,
  pageStart: number,
  pageSize: number
): Promise<DoubanItem[]> {
  const cacheKey = `douban:${type}:${tag}:${pageStart}:${pageSize}`;
  const cached = getCache<DoubanItem[]>(cacheKey);
  if (cached) return cached;

  const target = `${DOUBAN_API}?type=${type}&tag=${encodeURIComponent(tag)}&sort=recommend&page_limit=${pageSize}&page_start=${pageStart}`;

  let raw: DoubanRawSubject[] | undefined;

  // 1) 服务端直连
  try {
    const res = await fetchUpstream(target, {
      timeoutMs: 8000,
      headers: { 'User-Agent': UA, Referer: 'https://movie.douban.com/', Accept: 'application/json' },
    });
    if (res.ok) {
      const data = (await res.json()) as { subjects?: DoubanRawSubject[] };
      raw = data.subjects;
    }
  } catch {
    // 忽略，走降级
  }

  // 2) 降级：经 FALLBACK_CORS_PROXY
  if (!raw) {
    for (const proxy of fallbackProxies()) {
      try {
        const res = await fetchUpstream(proxy + encodeURIComponent(target), {
          timeoutMs: 8000,
          headers: { Accept: 'application/json' },
        });
        if (res.ok) {
          const data = (await res.json()) as { subjects?: DoubanRawSubject[] };
          raw = data.subjects;
          if (raw) break;
        }
      } catch {
        // 继续尝试下一个
      }
    }
  }

  if (!raw) throw new Error('豆瓣推荐获取失败');

  const items: DoubanItem[] = raw.map((s) => ({
    id: s.id,
    title: s.title,
    cover: s.cover,
    rating: s.rate && s.rate !== '0' ? s.rate : undefined,
    isTv: type === 'tv',
  }));

  setCache(cacheKey, items, CACHE_TTL);
  return items;
}


/** 豆瓣条目摘要（首页 Hero 用）：类型 / 地区 / 年份 / 演职员 / 短评 */
export async function fetchDoubanAbstract(id: string): Promise<DoubanAbstract> {
  const cacheKey = `douban-abstract:${id}`;
  const cached = getCache<DoubanAbstract>(cacheKey);
  if (cached) return cached;

  const target = `https://movie.douban.com/j/subject_abstract?subject_id=${encodeURIComponent(id)}`;
  const urls = [target, ...fallbackProxies().map((p) => p + encodeURIComponent(target))];
  for (const u of urls) {
    try {
      const res = await fetchUpstream(u, {
        timeoutMs: 6000,
        headers: { 'User-Agent': UA, Referer: 'https://movie.douban.com/', Accept: 'application/json' },
      });
      if (!res.ok) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = (await res.json()) as { subject?: any };
      const s = data.subject;
      if (!s) continue;
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
      const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 6) : undefined);
      const result: DoubanAbstract = {
        id,
        title: str(s.title),
        rate: str(s.rate),
        year: str(s.release_year),
        region: str(s.region),
        types: arr(s.types),
        duration: str(s.duration),
        episodes: str(s.episodes_count),
        directors: arr(s.directors),
        actors: arr(s.actors),
        comment: str(s.short_comment?.content),
      };
      setCache(cacheKey, result, 6 * 60 * 60 * 1000);
      return result;
    } catch {
      // 尝试下一个
    }
  }
  throw new Error('豆瓣摘要获取失败');
}
