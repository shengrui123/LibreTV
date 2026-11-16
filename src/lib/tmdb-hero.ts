import { cleanTmdbBackdrops, type TmdbBackdrop } from './tmdb-backdrops';
import { fetchDoubanAbstract } from './douban';
import { fetchUpstream, getCache, setCache } from './fetch-utils';

export interface TmdbHero { score?: string; logo?: string; backdrops?: string[] }
interface SearchResult { id: number; title?: string; original_title?: string; release_date?: string; vote_average?: number; vote_count?: number }

/** Only use a unique exact title and release-year match; ambiguous results stay hidden. */
export function matchTmdbMovie(results: SearchResult[], title: string, year: string): SearchResult | undefined {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase();
  const matches = results.filter((r) => /^\d{4}$/.test(year) && r.release_date?.slice(0, 4) === year && [r.title, r.original_title].some((s) => typeof s === 'string' && normalize(s) === normalize(title)));
  return matches.length === 1 && Number.isSafeInteger(matches[0].id) && matches[0].id > 0 ? matches[0] : undefined;
}

export async function fetchTmdbHero(id: string): Promise<TmdbHero | null> {
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) return null;
  const key = `tmdb-hero-v2:${id}`;
  const cached = getCache<TmdbHero>(key);
  if (cached) return cached;
  const subject = await fetchDoubanAbstract(id);
  if (!subject.title || !subject.year || !/^\d{4}$/.test(subject.year)) return null;
  const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/json' };
  const params = new URLSearchParams({ query: subject.title, language: 'zh-CN', year: subject.year });
  if (apiKey) params.set('api_key', apiKey);
  const search = await fetchUpstream(`https://api.themoviedb.org/3/search/movie?${params}`, { headers, timeoutMs: 5000, safeRedirects: false, redirect: 'error' });
  if (!search.ok) return null;
  const data = await search.json() as { results?: SearchResult[] };
  const movie = matchTmdbMovie(data.results ?? [], subject.title, subject.year);
  if (!movie) return null;
  const score = typeof movie.vote_average === 'number' && movie.vote_average > 0 && movie.vote_average <= 10 && (movie.vote_count ?? 0) > 0 ? movie.vote_average.toFixed(1) : undefined;
  let logo: string | undefined;
  let backdrops: string[] = [];
  try {
    const response = await fetchUpstream(`https://api.themoviedb.org/3/movie/${movie.id}/images?include_image_language=zh,en,null${apiKey ? `&api_key=${encodeURIComponent(apiKey)}` : ''}`, { headers, timeoutMs: 5000, safeRedirects: false, redirect: 'error' });
    if (response.ok) {
      const images = await response.json() as { backdrops?: TmdbBackdrop[]; logos?: { file_path?: string; iso_639_1?: string | null; vote_count?: number }[] };
      backdrops = cleanTmdbBackdrops(images.backdrops);
      const logos = (images.logos ?? []).filter((x) => typeof x.file_path === 'string' && /^\/[a-zA-Z0-9_-]+\.(png|webp)$/.test(x.file_path));
      logos.sort((a, b) => (a.iso_639_1 === 'zh' ? 0 : a.iso_639_1 === 'en' ? 1 : 2) - (b.iso_639_1 === 'zh' ? 0 : b.iso_639_1 === 'en' ? 1 : 2) || (b.vote_count ?? 0) - (a.vote_count ?? 0));
      if (logos[0]?.file_path) logo = `https://image.tmdb.org/t/p/w500${logos[0].file_path}`;
    }
  } catch { /* Score can still be shown if images are unavailable. */ }
  const result = { score, logo, backdrops };
  setCache(key, result, 6 * 60 * 60 * 1000);
  return result;
}
