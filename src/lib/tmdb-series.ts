import { fetchUpstream, getCache, setCache } from './fetch-utils';

export interface SeriesMetadata {
  id: number;
  baseTitle: string;
  season: number;
  images: string[];
  seasons: { number: number; name: string; count: number }[];
  episodes: { number: number; name: string; overview?: string; image?: string; date?: string; runtime?: number; rating?: number }[];
}
const normalize = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toLowerCase();
export function splitSeason(title: string) {
  const match = title.match(/\s*(?:第([一二三四五六七八九十百零〇\d]+)季|season\s*(\d+))\s*$/i);
  const value = match?.[1] || match?.[2] || '1';
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 零: 0, 〇: 0 };
  const parts = value.split('十');
  const season = /^\d+$/.test(value) ? Number(value) : parts.length === 2 ? (digits[parts[0]] || 1) * 10 + (digits[parts[1]] || 0) : digits[value];
  return { base: match ? title.slice(0, match.index).trim() : title, season: season || 1 };
}
export async function fetchSeriesMetadata(title: string, year: string, selected?: number): Promise<SeriesMetadata | null> {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) return null;
  const parsed = splitSeason(title);
  const season = selected ?? parsed.season;
  const key = `tmdb-series-v2:${title}:${year}:${season}`;
  const cached = getCache<SeriesMetadata>(key);
  if (cached) return cached;
  const get = async (path: string) => {
    const res = await fetchUpstream(`https://api.themoviedb.org/3/${path}${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`, { timeoutMs: 8000, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/json' }, redirect: 'error', safeRedirects: false });
    if (!res.ok) throw new Error('TMDB unavailable');
    return res.json();
  };
  const search = await get(`search/tv?${new URLSearchParams({ query: parsed.base, language: 'zh-CN' })}`);
  const matches = (search.results ?? []).filter((x: { name?: string; original_name?: string; first_air_date?: string }) => [x.name, x.original_name].some((name) => name && normalize(name) === normalize(parsed.base)) && (parsed.season !== 1 || !year || x.first_air_date?.slice(0, 4) === year));
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].id)) return null;
  const id = matches[0].id;
  const show = await get(`tv/${id}?language=zh-CN&append_to_response=images&include_image_language=zh,en,null`);
  const originalSeason = (show.seasons ?? []).find((x: { season_number: number }) => x.season_number === parsed.season);
  if (year && originalSeason?.air_date?.slice(0, 4) !== year) return null;
  const data = await get(`tv/${id}/season/${season}?language=zh-CN`);
  const result: SeriesMetadata = {
    id, baseTitle: parsed.base, season,
    images: (show.images?.backdrops ?? []).filter((x: { file_path?: string; width?: number }) => typeof x.file_path === 'string' && /^\/[\w-]+\.(jpg|png|webp)$/.test(x.file_path) && (x.width ?? 0) >= 1280).slice(0, 10).map((x: { file_path: string }) => `https://image.tmdb.org/t/p/original${x.file_path}`),
    seasons: (show.seasons ?? []).filter((x: { season_number: number }) => x.season_number > 0).map((x: { season_number: number; name: string; episode_count: number }) => ({ number: x.season_number, name: x.name, count: x.episode_count })),
    episodes: (data.episodes ?? []).map((x: { episode_number: number; name: string; overview?: string; still_path?: string; air_date?: string; runtime?: number; vote_average?: number }) => ({ number: x.episode_number, name: x.name, overview: x.overview || undefined, image: x.still_path && /^\/[\w-]+\.(jpg|png|webp)$/.test(x.still_path) ? `https://image.tmdb.org/t/p/w1280${x.still_path}` : undefined, date: x.air_date || undefined, runtime: x.runtime && x.runtime > 0 ? x.runtime : undefined, rating: x.vote_average && x.vote_average > 0 ? x.vote_average : undefined })),
  };
  setCache(key, result, 60 * 60_000);
  return result;
}
