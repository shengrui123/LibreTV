import { cleanTmdbBackdrops } from './tmdb-backdrops';
import { fetchUpstream, getCache, setCache } from './fetch-utils';
import type { DoubanAbstract, DoubanItem } from './types';
export interface DetailExtras {
  people: { name: string; role: string; photo?: string }[];
  items: DoubanItem[];
  trailers: { id: string; title: string; cover: string; runtime?: string; embedUrl?: string }[];
}
export interface TrendingEntry { item: DoubanItem; abstract: DoubanAbstract; extras?: DetailExtras }
const image = (path?: string, size = 'original') => path && /^\/[\w-]+\.(jpg|png|webp)$/.test(path) ? `https://image.tmdb.org/t/p/${size}${path}` : '';
async function get(path: string, extra: Record<string, string> = {}) {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const key = process.env.TMDB_API_KEY;
  if (!token && !key) throw new Error('尚未配置 TMDB API');
  const query = new URLSearchParams({ language: 'zh-CN', ...extra }); if (key) query.set('api_key', key);
  const response = await fetchUpstream(`https://api.themoviedb.org/3/${path}?${query}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, timeoutMs: 8000, redirect: 'error', safeRedirects: false });
  if (!response.ok) throw new Error('TMDB 暂时无法访问');
  return response.json();
}
interface Person { name: string; profile_path?: string; job?: string }
interface Video { key: string; name: string; site: string; type: string; official?: boolean }
interface Media { credits?: { cast?: Person[]; crew?: Person[] }; created_by?: Person[]; production_countries?: { iso_3166_1: string; name: string }[]; videos?: { results?: Video[] }; recommendations?: { results?: Media[] }; id: number; media_type?: string; title?: string; name?: string; poster_path?: string; backdrop_path?: string; overview?: string; release_date?: string; first_air_date?: string; vote_average?: number; vote_count?: number; number_of_episodes?: number; runtime?: number; genres?: { name: string }[] }
export function trendingEntry(media: Media, type = media.media_type): TrendingEntry | null {
  if (!['movie', 'tv'].includes(type || '') || !Number.isSafeInteger(media.id) || media.id <= 0 || !(media.title || media.name)) return null;
  const id = `tmdb-${type}-${media.id}`;
  return { item: { id, title: media.title || media.name!, cover: image(media.poster_path, 'w500'), rating: media.vote_count && media.vote_average ? media.vote_average.toFixed(1) : undefined, isTv: type === 'tv' }, abstract: { id, title: media.title || media.name, intro: media.overview, year: (media.release_date || media.first_air_date)?.slice(0, 4), stills: image(media.backdrop_path) ? [image(media.backdrop_path)] : [], types: media.genres?.map((entry) => entry.name), episodes: media.number_of_episodes ? String(media.number_of_episodes) : undefined, duration: media.runtime ? `${media.runtime} 分钟` : undefined } };
}
export function enrichTmdbDetail(entry: TrendingEntry, media: Media, type: string): TrendingEntry {
  const crew = media.credits?.crew?.filter((person) => person.job === 'Director') ?? [];
  const directors = crew.length ? crew : type === 'tv' ? media.created_by ?? [] : [];
  const actors = media.credits?.cast?.slice(0, 20) ?? [];
  const people = [...directors.map((person) => ({ name: person.name, role: '导演', photo: image(person.profile_path, 'w185') || undefined })), ...actors.map((person) => ({ name: person.name, role: '演员', photo: image(person.profile_path, 'w185') || undefined }))];
  const regionNames = new Intl.DisplayNames(['zh-CN'], { type: 'region' });
  entry.abstract.region = media.production_countries?.map((country) => (/^[A-Z]{2}$/.test(country.iso_3166_1) ? regionNames.of(country.iso_3166_1) : undefined) || country.name).join(' / ');
  entry.abstract.directors = directors.map((person) => person.name);
  entry.abstract.actors = actors.map((person) => person.name);
  entry.abstract.people = people.map((person) => ({ ...person, role: person.role as '导演' | '演员' }));
  entry.extras = { people, items: (media.recommendations?.results ?? []).map((item) => trendingEntry(item, type)?.item).filter((item): item is DoubanItem => !!item).slice(0, 16), trailers: (media.videos?.results ?? [])
    .filter((video) => video.site === 'YouTube' && /^[a-zA-Z0-9_-]{11}$/.test(video.key) && ['Trailer', 'Teaser'].includes(video.type))
    .sort((a, b) => Number(!!b.official) - Number(!!a.official))
    .slice(0, 8).map((video) => ({ id: `youtube:${video.key}`, title: video.name, cover: `https://i.ytimg.com/vi/${video.key}/hqdefault.jpg`, embedUrl: `https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1` })) };
  return entry;
}
export async function fetchTrending(id?: string): Promise<TrendingEntry[]> {
  if (id && !/^tmdb-(movie|tv)-\d{1,12}$/.test(id)) throw new Error('无效的 TMDB 条目');
  const key = `tmdb-trending-v3:${id || 'day'}`;
  const cached = getCache<TrendingEntry[]>(key); if (cached) return cached;
  let entries: TrendingEntry[];
  if (id) {
    const [, type, number] = id.split('-');
    const media = await get(`${type}/${number}`, { append_to_response: 'images,credits,videos,recommendations', include_video_language: 'zh,en,null', include_image_language: 'null' });
    const entry = trendingEntry(media, type);
    if (entry) {
      entry.abstract.stills = cleanTmdbBackdrops(media.images?.backdrops);
      if (!media.videos?.results?.length) {
        try { media.videos = await get(`${type}/${number}/videos`, { language: 'en-US' }); } catch { /* Keep the remaining detail if videos are unavailable. */ }
      }
      enrichTmdbDetail(entry, media, type);
    }
    entries = entry ? [entry] : [];
  } else {
    const data = await get('trending/all/day');
    entries = (data.results as Media[] || []).map((entry) => trendingEntry(entry)).filter((entry): entry is TrendingEntry => !!entry && !!entry.abstract.stills?.length).slice(0, 8);
  }
  setCache(key, entries, 30 * 60_000); return entries;
}
