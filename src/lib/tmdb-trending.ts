import { fetchUpstream, getCache, setCache } from './fetch-utils';
import type { DoubanAbstract, DoubanItem } from './types';
export interface TrendingEntry { item: DoubanItem; abstract: DoubanAbstract }
const image = (path?: string, size = 'original') => path && /^\/[\w-]+\.(jpg|png|webp)$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : '';
async function get(path: string) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const key = process.env.TMDB_API_KEY;
  if (!token && !key) throw new Error('尚未配置 TMDB API');
  const query = new URLSearchParams({ language: 'zh-CN' }); if (key) query.set('api_key', key);
  const response = await fetchUpstream(`https://api.themoviedb.org/3/${path}?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeoutMs: 8000, redirect: 'error', safeRedirects: false });
  if (!response.ok) throw new Error('TMDB 暂时无法访问');
  return response.json();
}
interface Media { id: number; media_type?: string; title?: string; name?: string; poster_path?: string; backdrop_path?: string; overview?: string; release_date?: string; first_air_date?: string; vote_average?: number; vote_count?: number; number_of_episodes?: number; runtime?: number; genres?: { name: string }[] }
export function trendingEntry(media: Media, type = media.media_type): TrendingEntry | null {
  if (!['movie', 'tv'].includes(type || '') || !Number.isSafeInteger(media.id) || media.id <= 0 || !(media.title || media.name)) return null;
  const id = `tmdb-${type}-${media.id}`;
  return { item: { id, title: media.title || media.name!, cover: image(media.poster_path, 'w500'), rating: media.vote_count && media.vote_average ? media.vote_average.toFixed(1) : undefined, isTv: type === 'tv' }, abstract: { id, title: media.title || media.name, intro: media.overview, year: (media.release_date || media.first_air_date)?.slice(0, 4), stills: image(media.backdrop_path) ? [image(media.backdrop_path)] : [], types: media.genres?.map((entry) => entry.name), episodes: media.number_of_episodes ? String(media.number_of_episodes) : undefined, duration: media.runtime ? `${media.runtime} 分钟` : undefined } };
}
export async function fetchTrending(id?: string): Promise<TrendingEntry[]> {
  if (id && !/^tmdb-(movie|tv)-\d{1,12}$/.test(id)) throw new Error('无效的 TMDB 条目');
  const key = `tmdb-trending:${id || 'day'}`;
  const cached = getCache<TrendingEntry[]>(key); if (cached) return cached;
  let entries: TrendingEntry[];
  if (id) {
    const [, type, number] = id.split('-');
    const entry = trendingEntry(await get(`${type}/${number}`), type); entries = entry ? [entry] : [];
  } else {
    const data = await get('trending/all/day');
    entries = (data.results as Media[] || []).map((entry) => trendingEntry(entry)).filter((entry): entry is TrendingEntry => !!entry && !!entry.abstract.stills?.length).slice(0, 8);
  }
  setCache(key, entries, 30 * 60_000); return entries;
}
