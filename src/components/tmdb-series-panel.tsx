'use client';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Cover } from './home-rows';
import type { SeriesMetadata } from '@/lib/tmdb-series';

export function TmdbSeriesPanel({ title, year, children }: { title: string; year?: string; children: ReactNode }) {
  const [selected, setSelected] = useState<number>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ['tmdb-series', title, year, selected],
    queryFn: async ({ signal }): Promise<SeriesMetadata | null> => {
      const params = new URLSearchParams({ title });
      if (year) params.set('year', year);
      if (selected !== undefined) params.set('season', String(selected));
      const response = await fetch(`/api/tmdb-series?${params}`, { signal });
      return response.ok ? response.json() : null;
    },
    staleTime: 60 * 60_000, retry: false,
  });
  const data = query.data;
  if (!data) return <>{children}</>;
  return <section aria-label="分季与分集资料">
    <div className="px-4 sm:px-8 lg:px-12 flex gap-3 overflow-x-auto no-scrollbar pb-4">{data.seasons.map((season) => <button key={season.number} type="button" aria-pressed={season.number === data.season} className={season.number === data.season ? 'btn-hero shrink-0' : 'btn-ghost shrink-0'} onClick={() => setSelected(season.number)}>第 {season.number} 季 · {season.count} 集</button>)}</div>
    <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-8 lg:px-12 py-2 snap-x">{data.episodes.map((episode) => <button key={episode.number} type="button" className="relative shrink-0 w-[80%] sm:w-[42%] lg:w-[28%] min-h-72 aspect-[6/5] rounded-2xl overflow-hidden bg-chip text-left snap-start focus-visible:ring-2 focus-visible:ring-accent" aria-label={`播放第 ${data.season} 季第 ${episode.number} 集`} onClick={() => {
      const playTitle = selected === undefined ? title : `${data.baseTitle} 第${data.season}季`;
      router.push(`/watch?${new URLSearchParams({ auto: '1', title: playTitle, index: String(episode.number - 1), episodeNumber: String(episode.number) })}`);
    }}>
      {episode.image && <Cover url={episode.image} alt="" className="absolute inset-0 w-full h-full object-cover" />}
      <span className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-transparent" />
      <span className="absolute inset-x-4 bottom-4 text-white"><span className="block text-xs text-white/70">第 {episode.number} 集</span><span className="block mt-1 text-lg font-bold">{episode.name}</span>{episode.overview && <span className="block mt-2 text-sm text-white/75 line-clamp-2">{episode.overview}</span>}<span className="mt-3 flex flex-wrap gap-3 text-xs text-white/80">{episode.runtime && <span>{episode.runtime} 分钟</span>}{episode.date && <span>{episode.date}</span>}{episode.rating && <span className="text-yellow-300">★ {episode.rating.toFixed(1)}</span>}</span></span>
    </button>)}</div>
    {!data.episodes.length && <p className="px-4 sm:px-8 lg:px-12 text-muted">本季暂无分集资料</p>}
    <p className="px-4 sm:px-8 lg:px-12 mt-2 text-xs text-muted">分集资料及图片来自 <a href={`https://www.themoviedb.org/tv/${data.id}`} target="_blank" rel="noopener noreferrer" className="underline">TMDB</a>。This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
  </section>;
}
