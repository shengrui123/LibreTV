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


const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/** 豆瓣移动端 rexxar 接口：含剧情简介，数据中心 IP 下也可用 */
async function fetchRexxarStills(kind: string, id: string): Promise<string[]> {
  try {
    const res = await fetchUpstream(
      `https://m.douban.com/rexxar/api/v2/${kind}/${encodeURIComponent(id)}/photos?start=0&count=30`,
      {
        timeoutMs: 6000,
        headers: { 'User-Agent': MOBILE_UA, Referer: 'https://m.douban.com/', Accept: 'application/json' },
      }
    );
    if (!res.ok) {
      console.warn(`[douban] rexxar photos ${kind}/${id} -> ${res.status}`);
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await res.json()) as { photos?: any[] };
    const out: string[] = [];
    for (const p of data.photos ?? []) {
      const img = p?.image?.large;
      if (!img?.url || !img.width || !img.height) continue;
      // 只要横版剧照（宽高比 ≥ 1.4），竖版多为海报/宣传照
      if (img.width / img.height < 1.4 || img.width < 800) continue;
      out.push(String(img.url));
      if (out.length >= 6) break;
    }
    return out;
  } catch {
    return [];
  }
}

async function fetchRexxarAbstract(id: string): Promise<DoubanAbstract | null> {
  for (const kind of ['movie', 'tv']) {
    try {
      // 详情与剧照并行请求，首屏 Hero 耗时减半
      const [res, stillsPre] = await Promise.all([
        fetchUpstream(`https://m.douban.com/rexxar/api/v2/${kind}/${encodeURIComponent(id)}`, {
          timeoutMs: 6000,
          headers: { 'User-Agent': MOBILE_UA, Referer: 'https://m.douban.com/', Accept: 'application/json' },
        }),
        fetchRexxarStills(kind, id),
      ]);
      if (!res.ok) {
        console.warn(`[douban] rexxar ${kind}/${id} -> ${res.status}`);
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (await res.json()) as any;
      if (!s?.title) continue;
      const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
      const names = (v: unknown) =>
        Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean).slice(0, 6) : undefined;
      const rate = typeof s.rating?.value === 'number' && s.rating.value > 0 ? s.rating.value.toFixed(1) : undefined;
      const eps = Number(s.episodes_count) > 0 ? String(s.episodes_count) : undefined;
      const stills = stillsPre;
      return {
        stills,
        id,
        title: str(s.title),
        rate,
        year: str(s.year),
        region: Array.isArray(s.countries) ? s.countries.slice(0, 2).join(' ') : undefined,
        types: Array.isArray(s.genres) ? s.genres.slice(0, 4) : undefined,
        duration: Array.isArray(s.durations) ? str(s.durations[0]) : undefined,
        episodes: eps,
        directors: names(s.directors),
        actors: names(s.actors),
        people: ([...((Array.isArray(s.directors) ? s.directors : []).map((x: unknown) => ({ person: x, role: '导演' as const }))), ...((Array.isArray(s.actors) ? s.actors : []).map((x: unknown) => ({ person: x, role: '演员' as const })))] as { person: unknown; role: '导演' | '演员' }[]).flatMap(({ person, role }) => {
          if (!person || typeof person !== 'object') return [];
          const p = person as { name?: unknown; avatar?: { large?: unknown; normal?: unknown } };
          const name = str(p.name);
          const photo = str(p.avatar?.large) || str(p.avatar?.normal);
          return name ? [{ name, role, photo: photo && /^https:\/\//.test(photo) ? photo : undefined }] : [];
        }).slice(0, 12),
        intro: str(s.intro)?.replace(/\s+/g, ' '),
      };
    } catch {
      // 尝试下一种类型
    }
  }
  return null;
}

/** 豆瓣条目摘要（首页 Hero / 预览弹窗）：优先 rexxar（含简介），失败回退 PC 端 subject_abstract */
export async function fetchDoubanAbstract(id: string): Promise<DoubanAbstract> {
  const cacheKey = `douban-abstract:${id}`;
  const cached = getCache<DoubanAbstract>(cacheKey);
  if (cached) return cached;

  const rex = await fetchRexxarAbstract(id);
  if (rex) {
    setCache(cacheKey, rex, 6 * 60 * 60 * 1000);
    return rex;
  }

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
      // 回退结果没有剧照/简介：只短暂缓存，便于 rexxar 恢复后尽快拿到完整数据
      setCache(cacheKey, result, 10 * 60 * 1000);
      return result;
    } catch {
      // 尝试下一个
    }
  }
  throw new Error('豆瓣摘要获取失败');
}

export interface HeroEntry {
  item: DoubanItem;
  abstract: DoubanAbstract;
}

// Multiple visitors can request the same cold hero before the first response is
// cached. Share that work within an instance instead of repeating every upstream
// detail request and increasing the likelihood of rate limiting.
const pendingHeroes = new Map<string, Promise<HeroEntry[]>>();

/**
 * 首页 Hero 数据：热门列表中「有高清横版剧照」的前 N 部。
 * 服务端低并发逐个拉摘要（避免触发豆瓣限流），整体缓存 30 分钟。
 */
export async function fetchDoubanHero(type: 'movie' | 'tv', count = 8): Promise<HeroEntry[]> {
  const cacheKey = `douban-hero:${type}:${count}`;
  const cached = getCache<HeroEntry[]>(cacheKey);
  if (cached) return cached;

  const pending = pendingHeroes.get(cacheKey);
  if (pending) return pending;
  const request = loadDoubanHero(type, count, cacheKey);
  pendingHeroes.set(cacheKey, request);
  try {
    return await request;
  } finally {
    pendingHeroes.delete(cacheKey);
  }
}

async function loadDoubanHero(type: 'movie' | 'tv', count: number, cacheKey: string): Promise<HeroEntry[]> {
  const list = await fetchDoubanRecommend(type, '热门', 0, 24);
  const out: HeroEntry[] = [];
  const queue = list.slice(0, count + 4);
  const CONCURRENCY = 4;
  for (let i = 0; i < queue.length && out.length < count; i += CONCURRENCY) {
    const batch = queue.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map((item) => fetchDoubanAbstract(item.id).then((a) => ({ item, abstract: a })).catch(() => null))
    );
    for (const r of results) if (r?.abstract.stills?.length && out.length < count) out.push(r);
  }
  // 一部剧照都没拿到（被限流）时不写长缓存，下次请求再试
  setCache(cacheKey, out, out.length ? 30 * 60 * 1000 : 60 * 1000);
  return out;
}
