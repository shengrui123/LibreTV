'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Cover, Row, PosterCard, POSTER_W } from '@/components/home-rows';
import { TmdbSeriesPanel, useTmdbSeriesMetadata } from '@/components/tmdb-series-panel';
import { CastPortrait } from '@/components/cast-portrait';
import { buildRecommendationDetailUrl, buildSourceDetailUrl } from '@/lib/detail-url';
import { useAbstract } from '@/components/home-hero';
import { useTmdbHero } from '@/components/use-tmdb-hero';
import { Icon } from '@/components/icon';
import { EmptyState, ErrorState } from '@/components/states';
import { useAuth } from '@/components/auth';
import { useAppStore, resolveSource, isSourceDisabled, isInDisabledSubscription } from '@/lib/store';
import { api } from '@/lib/client-api';
import { validateSourceUrl } from '@/lib/utils';
import { copyToClipboard } from '@/lib/clipboard';
import { useToast } from '@/components/toast';
import { useCleanBackdrops } from '@/components/use-clean-backdrops';
import { useInView } from '@/components/use-in-view';
import type { DoubanAbstract, DoubanItem, SearchResultItem, SourceConfig } from '@/lib/types';

export default function DetailPage() {
  return <Suspense><DetailContent /></Suspense>;
}

function DetailContent() {
  const params = useSearchParams();
  const router = useRouter();
  const kind = params.get('kind');
  const id = params.get('id') || '';
  const title = params.get('title') || '';
  const cover = params.get('cover') || '';
  const sourceKey = params.get('source') || '';
  const sourceUrl = params.get('sourceUrl') || '';
  const sourceName = params.get('sourceName') || '';
  const isSource = kind === 'source';
  const valid = !!id && !!title && (kind === 'recommendation' || (isSource && !!sourceKey));
  const back = () => {
    const returnTo = params.get('returnTo');
    router.push(returnTo && returnTo.startsWith('/') && !returnTo.startsWith('//') && !returnTo.includes('\\') ? returnTo : '/');
  };
  return (
    <div className="min-h-screen bg-page text-content">
      <main className="pb-24">
        {!valid ? <div className="pt-28 px-6"><button onClick={back} className="btn-ghost btn-sm mb-6"><Icon name="chevronLeft" className="w-4 h-4" /> 返回</button><EmptyState icon="alert" title="详情链接不完整" description="请返回首页重新选择影片" /></div> : isSource ? (
          <UnifiedSourceDetail id={id} title={title} cover={cover} sourceKey={sourceKey} sourceUrl={sourceUrl} sourceName={sourceName} onBack={back} />
        ) : (
          <RecommendationDetail item={{ id, title, cover, rating: params.get('rating') || undefined, isTv: params.get('tv') === '1' }} onBack={back} />
        )}
      </main>
    </div>
  );
}

/** 与首页相同的沉浸式剧照、渐隐和玻璃控件。 */
function DetailHero({ image, fallback, onBack, children, stills, stillIndex = 0, onSelectStill }: { image?: string; fallback?: boolean; onBack: () => void; children: ReactNode; stills?: string[]; stillIndex?: number; onSelectStill?: (index: number) => void }) {
  return (
    <section data-hero className="relative isolate overflow-hidden min-h-[560px] sm:min-h-[620px] lg:min-h-[min(80vh,760px)] flex items-end bg-[#111] text-white">
      {stills?.length ? stills.map((url, i) => url.startsWith('data:') ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={i} src={url} alt="" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 motion-reduce:transition-none ${i === stillIndex ? 'opacity-100' : 'opacity-0'}`} />) : <Cover key={`${url}-${i}`} url={url} alt="" eager={i === stillIndex} className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 motion-reduce:transition-none ${i === stillIndex ? 'opacity-100' : 'opacity-0'}`} />) : image && !fallback && <Cover url={image} alt="" eager className="absolute inset-0 w-full h-full object-cover" />}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/60 via-25% to-transparent to-70%" />
      <button onClick={onBack} aria-label="返回上一页" className="btn-icon-glass absolute top-4 left-4 sm:left-8 lg:left-12 z-20"><Icon name="chevronLeft" className="w-5 h-5" /></button>
      <div className="relative z-10 w-full px-4 sm:px-8 lg:px-12 pt-32 pb-10 sm:pb-14">{children}</div>
      {stills && stills.length > 1 && onSelectStill && <div className="absolute z-20 bottom-2 right-4 sm:bottom-5 sm:right-8 lg:right-12 flex items-center gap-1">{stills.map((url, i) => <button key={i} type="button" aria-label={`查看第 ${i + 1} 张影片画面`} aria-current={i === stillIndex} onClick={() => onSelectStill(i)} className="group grid h-8 min-w-5 place-items-center"><span className={`relative overflow-hidden rounded-full transition-[width,height] duration-500 bg-white/45 ${i === stillIndex ? 'h-1.5 w-6' : 'h-1.5 w-1.5 group-hover:bg-white/75'}`}>{i === stillIndex && <span key={stillIndex} className="hero-progress absolute inset-0 rounded-full bg-white origin-left motion-reduce:animate-none motion-reduce:scale-x-100" style={{ animationDuration: '8000ms' }} />}</span></button>)}</div>}
    </section>
  );
}

function ShareButton({ title }: { title: string }) {
  const { toast } = useToast();
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title, url: window.location.href });
      else toast(await copyToClipboard(window.location.href) ? '链接已复制' : '复制失败，请检查浏览器权限', 'info');
    } catch { /* 用户取消分享 */ }
  };
  return <button className="btn-icon-glass" aria-label="分享" onClick={share}><svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" /></svg></button>;
}

const normalizeTitle = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase();

/** 从可播放的视频中截取画面；无法跨域读取或分辨率不足时保留海报。 */
const episodeFrameCache = new Map<string, string[]>();

async function frameCacheKey(url: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(url));
  return `${window.location.origin}/__episode-frames/${Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

async function readSavedFrame(url: string): Promise<string[] | undefined> {
  try {
    const cache = await caches.open('libretv-episode-frames-v1');
    const response = await cache.match(await frameCacheKey(url));
    if (response && Date.now() - Number(response.headers.get('x-saved-at')) < 7 * 86400000) return await response.json();
  } catch { /* 缓存不可用时按需提取 */ }
}

async function saveFrame(url: string, images: string[]) {
  try {
    const cache = await caches.open('libretv-episode-frames-v1');
    await cache.put(await frameCacheKey(url), new Response(JSON.stringify(images), { headers: { 'Content-Type': 'application/json', 'x-saved-at': String(Date.now()) } }));
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 60)).map((key) => cache.delete(key)));
  } catch { /* 配额不足不影响图片显示 */ }
}

function useVideoFrames(title: string, episodeUrl?: string, enabled = true) {
  const [frames, setFrames] = useState<string[]>([]);
  const { verified } = useAuth();
  const sourceKeys = useAppStore((state) => state.selectedKeys);
  useEffect(() => {
    const cached = episodeUrl ? episodeFrameCache.get(episodeUrl) : undefined;
    setFrames(cached || []);
    if (cached || !verified || !enabled) return;
    const controller = new AbortController();
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';
    let hls: import('hls.js').default | undefined;
    const waitFor = (event: string) => new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => finish(false), 12000);
      const done = () => finish(true);
      const fail = () => finish(false);
      function finish(ok: boolean) {
        window.clearTimeout(timer);
        video.removeEventListener(event, done);
        video.removeEventListener('error', fail);
        controller.signal.removeEventListener('abort', fail);
        if (ok) resolve(); else reject(new Error('无法读取视频画面'));
      }
      video.addEventListener(event, done, { once: true });
      video.addEventListener('error', fail, { once: true });
      controller.signal.addEventListener('abort', fail, { once: true });
    });
    void (async () => {
      if (episodeUrl) {
        const saved = await readSavedFrame(episodeUrl);
        if (controller.signal.aborted) return;
        if (saved?.length) { episodeFrameCache.set(episodeUrl, saved); setFrames(saved); return; }
      }
      const state = useAppStore.getState();
      const sources = [...new Set(state.selectedKeys)].map((key) => resolveSource(state, key)).filter((source): source is SourceConfig => !!source && validateSourceUrl(source.url) && !isSourceDisabled(state, source.key) && !isInDisabledSubscription(state, source.key));
      const matches = episodeUrl ? [] : (sources.length ? (await api.search(title, sources, state.yellowFilter, { signal: controller.signal })).list.filter((item) => normalizeTitle(item.name) === normalizeTitle(title)) : []);
      const candidates: ({ url: string } | { item: SearchResultItem; source: SourceConfig })[] = episodeUrl ? [{ url: episodeUrl }] : matches.flatMap((item) => { const source = sources.find((entry) => entry.key === item.sourceKey); return source ? [{ item, source }] : []; });
      for (const candidate of candidates) {
        if (controller.signal.aborted) return;
        try {
          const url = 'url' in candidate ? candidate.url : (await api.detail(candidate.item.vodId, candidate.source, controller.signal)).episodes[0];
          if (!url || !/^https:\/\//i.test(url)) continue;
          const isHls = /\.m3u8(?:[?#]|$)/i.test(url) && !video.canPlayType('application/vnd.apple.mpegurl');
          const Hls = isHls ? (await import('hls.js')).default : undefined;
          if (isHls && !Hls?.isSupported()) continue;
          const metadata = waitFor('loadedmetadata');
          if (Hls) {
            hls = new Hls({ enableWorker: true, maxBufferLength: 10 });
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              const best = hls?.levels.reduce((winner, level, i, levels) => (level.height || 0) > (levels[winner]?.height || 0) ? i : winner, 0);
              if (hls && best !== undefined) hls.currentLevel = best;
            });
            hls.loadSource(url);
            hls.attachMedia(video);
          } else video.src = url;
          await metadata;
          if (!Number.isFinite(video.duration) || video.duration <= 0) throw new Error('视频时长未知');
          const images: string[] = [];
          for (const fraction of episodeUrl ? [0.2] : [0.2, 0.5, 0.8]) {
            const seeked = waitFor('seeked');
            video.currentTime = video.duration * fraction;
            await seeked;
            if (video.videoWidth < 1280 || video.videoHeight < 720) throw new Error('视频分辨率不足');
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 1920 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
            images.push(canvas.toDataURL('image/jpeg', 0.8));
          }
          if (!controller.signal.aborted) {
            if (episodeUrl) { if (episodeFrameCache.size >= 30) episodeFrameCache.delete(episodeFrameCache.keys().next().value!); episodeFrameCache.set(episodeUrl, images); void saveFrame(episodeUrl, images); }
            setFrames(images);
          }
          return;
        } catch { hls?.destroy(); hls = undefined; video.removeAttribute('src'); video.load(); }
      }
    })().catch(() => {});
    return () => { controller.abort(); hls?.destroy(); video.removeAttribute('src'); video.load(); };
  }, [title, verified, sourceKeys, episodeUrl, enabled]);
  return frames;
}

function DetailLoadingLines() {
  return <div role="status" aria-label="正在加载影片资料" className="mt-5 w-full max-w-md space-y-2 motion-safe:animate-pulse"><div className="h-3 rounded-sm bg-white/15" /><div className="h-3 rounded-sm bg-white/15" /><div className="h-3 w-4/5 rounded-sm bg-white/15" /><div className="flex gap-3 pt-3"><div className="h-2 w-20 rounded bg-white/15" /><div className="h-2 w-16 rounded bg-white/15" /><div className="h-2 w-20 rounded bg-white/15" /></div></div>;
}

function EpisodeLoadingCards() {
  return <section aria-label="正在加载剧集" className="px-4 sm:px-8 lg:px-12"><div className="h-6 w-16 rounded bg-content/15 motion-safe:animate-pulse" /><div className="flex gap-3 overflow-hidden mt-5 motion-safe:animate-pulse">{[0, 1, 2].map((i) => <div key={i} className="shrink-0 w-[72%] sm:w-[38%] lg:w-[25%] aspect-video rounded-2xl bg-content/10" />)}</div></section>;
}

function RecommendationDetail({ item, onBack, playbackSource }: { item: DoubanItem; onBack: () => void; playbackSource?: Parameters<typeof SourceDetail>[0] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [introOpen, setIntroOpen] = useState(false);
  const [trailer, setTrailer] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!trailer) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setTrailer(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [trailer]);
  const playNow = (index = 0, episodeName?: string) => {
    const params = new URLSearchParams({ auto: '1', title: item.title, index: String(index) });
    const selectedName = episodeName || sourceDetail?.episodeNames?.[index];
    if (selectedName) params.set('episodeName', selectedName);
    if (playbackSource) {
      const source = resolveSource(useAppStore.getState(), playbackSource.sourceKey, { url: playbackSource.sourceUrl, name: playbackSource.sourceName });
      params.set('title', playbackSource.title);
      params.set('source', playbackSource.sourceKey);
      params.set('id', playbackSource.id);
      if (source?.url) params.set('sourceUrl', source.url);
      if (source?.detail) params.set('detail', source.detail);
    }
    router.push(`/watch?${params}`);
  };
  const store = useAppStore();
  const { verified } = useAuth();
  const source = playbackSource ? resolveSource(store, playbackSource.sourceKey, { url: playbackSource.sourceUrl, name: playbackSource.sourceName }) : undefined;
  const sourceQuery = useQuery({
    queryKey: ['source-detail', playbackSource?.sourceKey, playbackSource?.id, source?.url],
    queryFn: ({ signal }) => api.detail(playbackSource!.id, source!, signal),
    enabled: !!verified && !!source && !!playbackSource,
    retry: false,
  });
  const sourceDetail = sourceQuery.data;
  const info = sourceDetail?.videoInfo;
  const sourceAbstract: DoubanAbstract | undefined = info ? {
    id: item.id, title: item.title, year: info.year, region: info.area,
    types: info.typeName ? [info.typeName] : undefined,
    intro: info.desc?.replace(/<[^>]*>/g, '').trim(),
    episodes: sourceDetail && sourceDetail.episodes.length > 1 ? String(sourceDetail.episodes.length) : undefined,
    directors: info.director?.split(/[,，/、]/).filter(Boolean),
    actors: info.actor?.split(/[,，/、]/).filter(Boolean),
  } : undefined;
  const abs = useAbstract(item);
  const extras = useQuery({
    queryKey: ['douban-extras', item.id, item.isTv],
    queryFn: async ({ signal }): Promise<{ people: { name: string; role: string; photo?: string }[]; items: DoubanItem[]; trailers: { id: string; title: string; cover: string; runtime?: string }[] }> => {
      const params = new URLSearchParams({ id: item.id, type: item.isTv ? 'tv' : 'movie' });
      const response = await fetch(`/api/douban/extras?${params}`, { signal });
      if (!response.ok) throw new Error('获取失败');
      return response.json();
    },
    enabled: /^\d{1,12}$/.test(item.id), staleTime: 60 * 60_000, retry: false,
  });
  const tmdb = useTmdbHero(item.id, true);
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [tmdb.data?.logo]);
  const [stillIndex, setStillIndex] = useState(0);
  useEffect(() => setStillIndex(0), [item.id]);
  const a = abs.data ?? sourceAbstract;
  const tmdbSeries = useTmdbSeriesMetadata(item.title, a?.year, undefined, !!a?.year && (!!item.isTv || !!a?.episodes));
  const nativeTmdb = useQuery({
    queryKey: ['tmdb-detail-backdrops-v2', item.id],
    enabled: /^tmdb-(movie|tv)-\d+$/.test(item.id),
    queryFn: async ({ signal }): Promise<string[]> => {
      const response = await fetch(`/api/tmdb-trending?id=${encodeURIComponent(item.id)}`, { signal });
      if (!response.ok) throw new Error('获取 TMDB 剧照失败');
      return (await response.json()).entries[0]?.abstract.stills ?? [];
    }, staleTime: 30 * 60_000, retry: false,
  });
  const heroImages = useCleanBackdrops(item.id.startsWith('tmdb-') ? nativeTmdb.data ?? [] : [...(tmdb.data?.backdrops ?? []), ...(tmdbSeries.data?.images ?? [])]);
  const heroIndex = stillIndex % Math.max(heroImages.length, 1);
  useEffect(() => {
    if (heroImages.length < 2) return;
    const timer = window.setTimeout(() => setStillIndex((index) => (index + 1) % heroImages.length), 8000);
    return () => window.clearTimeout(timer);
  }, [stillIndex, heroImages.length]);
  const meta = [item.isTv || a?.episodes ? '剧集' : '电影', a?.types?.join(' / '), a?.year, a?.region, a?.episodes ? `${a.episodes} 集` : a?.duration].filter(Boolean).join(' · ');
  const rating = a?.rate || item.rating;
  return (
    <article>
      <DetailHero onBack={onBack} stills={heroImages} stillIndex={heroIndex} onSelectStill={setStillIndex}>
        <div className="max-w-[660px]">
          {tmdb.data?.logo && !logoFailed ? (
            <h1>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tmdb.data.logo} alt={item.title} className="max-w-full max-h-24 sm:max-h-32 object-contain object-left" onError={() => setLogoFailed(true)} />
            </h1>
          ) : <h1 className="hero-title text-4xl sm:text-5xl lg:text-[56px] font-black leading-tight">{item.title}</h1>}
          {abs.isLoading && !a ? <DetailLoadingLines /> : <p className="mt-3 text-sm sm:text-base text-white/85">{meta}</p>}
          {a?.intro && <button type="button" onClick={() => setIntroOpen(true)} className="mt-4 block text-left text-sm sm:text-base leading-relaxed text-white/75 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white rounded"><span className="line-clamp-3">{a.intro}</span></button>}
          {(rating || tmdb.data?.score || tmdbSeries.data?.score) && <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm font-semibold text-white">{rating && <span className="inline-flex items-center gap-1.5" aria-label={`${item.id.startsWith('tmdb-') ? 'TMDB' : '豆瓣'}评分 ${rating}`}>{item.id.startsWith('tmdb-') ? 'TMDB ' : <Cover url="https://www.douban.com/favicon.ico" alt="" className="w-5 h-5 rounded-sm" />}{rating}</span>}{(tmdbSeries.data?.score || tmdb.data?.score) && <span>TMDB {tmdbSeries.data?.score || tmdb.data?.score}</span>}<span className="text-white/65" title="暂无可靠的烂番茄评分">烂番茄 —</span></p>}
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button onClick={() => playNow()} className="btn bg-white text-black px-6 py-2.5 text-[15px] font-semibold hover:bg-white/90"><Icon name="play" className="w-4 h-4" /> 立即播放</button>
            {/^[0-9]+$/.test(item.id) && <a className="btn-icon-glass" href={`https://movie.douban.com/subject/${item.id}/`} target="_blank" rel="noopener noreferrer" aria-label="打开豆瓣页面" title="打开豆瓣页面">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://www.douban.com/favicon.ico" alt="" className="w-5 h-5 rounded-sm" />
            </a>}
            <ShareButton title={item.title} />
          </div>
        </div>
      </DetailHero>
      <div className="space-y-10 pt-8 sm:pt-10">
        {playbackSource && sourceQuery.isLoading && !a && <EpisodeLoadingCards />}
        {playbackSource && sourceQuery.isError && <div className="px-4 sm:px-8 lg:px-12"><ErrorState message="片源资料加载失败，请稍后重试" /></div>}
        {item.isTv && abs.isLoading && !a ? <EpisodeLoadingCards /> : (item.isTv || !!a?.episodes) && <TmdbSeriesPanel key={item.title} title={item.title} year={a?.year} onPlay={(index) => playNow(index)}>{sourceDetail ? <EpisodeRow count={sourceDetail.episodes.length} title={item.title} cover={item.cover} names={sourceDetail.episodeNames} urls={sourceDetail.episodes} onPlay={playNow} /> : <RecommendedEpisodes title={item.title} cover={item.cover} count={a?.episodes} onPlay={(index, name) => { void playNow(index, name); }} />}</TmdbSeriesPanel>}
        <section aria-label="预告片"><h2 className="px-4 sm:px-8 lg:px-12 text-xl sm:text-2xl font-bold">预告片</h2>{extras.isLoading ? <p className="px-4 sm:px-8 lg:px-12 mt-3 text-sm text-muted">正在获取预告片…</p> : extras.data?.trailers?.length ? <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-8 lg:px-12 py-4 snap-x scroll-pl-4 sm:scroll-pl-8 lg:scroll-pl-12">{extras.data.trailers.map((trailer) => <button key={trailer.id} type="button" onClick={() => setTrailer({ id: trailer.id, title: trailer.title })} className="shrink-0 w-[72%] sm:w-[38%] lg:w-[25%] text-left snap-start group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-2xl"><div className="relative aspect-video overflow-hidden rounded-2xl bg-chip"><Cover url={trailer.cover} alt="" className="w-full h-full object-cover" /><span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /><span className="absolute inset-0 flex items-center justify-center"><span className="glass glass-clear glass-dark rounded-full p-3"><Icon name="play" className="w-5 h-5" /></span></span>{trailer.runtime && <span className="absolute right-3 bottom-3 text-xs text-white">{trailer.runtime}</span>}</div><span className="block mt-2 text-sm font-medium text-content line-clamp-2">{trailer.title}</span></button>)}</div> : <p className="px-4 sm:px-8 lg:px-12 mt-3 text-sm text-muted">暂无预告片</p>}</section>
        {abs.isError && <p role="status" className="px-4 sm:px-8 lg:px-12 text-sm text-muted">影片资料暂时无法获取，请稍后重试。</p>}
        {(a?.directors?.length || a?.actors?.length) ? <section aria-label="演职人员" className="px-4 sm:px-8 lg:px-12"><h2 className="text-xl sm:text-2xl font-bold mb-4">演职人员</h2><div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">{a?.directors?.map((name, i) => <div key={`director-${i}`} className="glass glass-thick rounded-2xl p-4 w-36 shrink-0">{(extras.data?.people ?? a.people)?.find((p) => p.name === name && p.role === '导演')?.photo && <CastPortrait url={(extras.data?.people ?? a.people)?.find((p) => p.name === name && p.role === '导演')?.photo} name={name} />}<p className="font-semibold">{name}</p><p className="text-sm text-muted mt-1">导演</p></div>)}{a?.actors?.map((name, i) => <div key={`actor-${i}`} className="glass glass-thick rounded-2xl p-4 w-36 shrink-0">{(extras.data?.people ?? a.people)?.find((p) => p.name === name && p.role === '演员')?.photo && <CastPortrait url={(extras.data?.people ?? a.people)?.find((p) => p.name === name && p.role === '演员')?.photo} name={name} />}<p className="font-semibold">{name}</p><p className="text-sm text-muted mt-1">演员</p></div>)}</div></section> : null}
        {!!extras.data?.items.length && <Row title="相关推荐">{extras.data.items.map((recommendation) => <PosterCard key={recommendation.id} item={recommendation} className={POSTER_W} showTitle onOpen={(picked) => router.push(buildRecommendationDetailUrl(picked, window.location.pathname + window.location.search))} />)}</Row>}
      </div>
      {introOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4" role="dialog" aria-modal="true" aria-label="影片简介" onClick={() => setIntroOpen(false)} onKeyDown={(event) => { if (event.key === 'Escape') setIntroOpen(false); }}><div className="glass glass-thick rounded-3xl w-full max-w-xl max-h-[75vh] overflow-y-auto p-6 text-content" onClick={(event) => event.stopPropagation()}><div className="flex items-center justify-between gap-4 mb-4"><h2 className="text-xl font-bold">简介</h2><button autoFocus type="button" aria-label="关闭简介" className="btn-icon-glass" onClick={() => setIntroOpen(false)}><Icon name="close" className="w-5 h-5" /></button></div><p className="whitespace-pre-wrap leading-relaxed">{a?.intro}</p>{a?.comment && <blockquote className="mt-4 text-muted border-l-2 border-brand pl-3">{a.comment}</blockquote>}</div></div>}
      {trailer && <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={trailer.title} onClick={() => setTrailer(null)}><div className="relative w-full max-w-4xl" onClick={(event) => event.stopPropagation()}><button type="button" className="btn-icon-glass absolute -top-12 right-0" aria-label="关闭预告片" onClick={() => setTrailer(null)}><Icon name="close" className="w-5 h-5" /></button><video className="w-full max-h-[75vh] rounded-2xl bg-black" src={`/api/douban/trailer?id=${encodeURIComponent(trailer.id)}`} controls autoPlay playsInline onError={() => toast('预告片暂不可用，请稍后重试', 'warning')} /></div></div>}
    </article>
  );
}

function EpisodeImage({ title, url, cover }: { title: string; url?: string; cover?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(!!url, 300);
  const frames = useVideoFrames(title, url, !!url && inView);
  return <div ref={ref} className="absolute inset-0">{frames[0] ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={frames[0]} alt="" className="w-full h-full object-cover" />
  ) : cover ? <><Cover url={cover} alt="" className="w-full h-full object-cover" /><span className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-1 text-xs text-white">封面</span></> : null}</div>;
}

function RecommendedEpisodes({ title, cover, count, onPlay }: { title: string; cover?: string; count?: string; onPlay: (index: number, name?: string) => void }) {
  const episodeCount = Number(count);
  const { verified } = useAuth();
  const keys = useAppStore((state) => state.selectedKeys);
  const router = useRouter();
  const seasonBase = title.replace(/\s*(?:第[一二三四五六七八九十百零〇0-9]+季|[Ss]eason\s*\d+)\s*$/, '').trim();
  const seasons = useQuery({
    queryKey: ['recommendation-seasons', seasonBase, keys],
    enabled: !!verified && !!seasonBase && keys.length > 0,
    staleTime: 5 * 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const state = useAppStore.getState();
      const sources = [...new Set(state.selectedKeys)].map((key) => resolveSource(state, key)).filter((source): source is SourceConfig => !!source && validateSourceUrl(source.url) && !isSourceDisabled(state, source.key) && !isInDisabledSubscription(state, source.key));
      if (!sources.length) return [];
      const result = await api.search(seasonBase, sources, state.yellowFilter, { signal });
      const base = normalizeTitle(seasonBase);
      const suffix = /^(?:第[一二三四五六七八九十百零〇0-9]+季|season\d+)$/;
      return result.list.filter((entry) => { const name = normalizeTitle(entry.name); return name === base || (name.startsWith(base) && suffix.test(name.slice(base.length))); }).filter((entry, i, all) => all.findIndex((other) => normalizeTitle(other.name) === normalizeTitle(entry.name)) === i);
    },
  });
  const episodes = useQuery({
    queryKey: ['episode-metadata', title, episodeCount, keys],
    enabled: !!verified && Number.isInteger(episodeCount) && episodeCount > 0 && episodeCount <= 500 && keys.length > 0,
    staleTime: 5 * 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const state = useAppStore.getState();
      const sources = [...new Set(state.selectedKeys)].map((key) => resolveSource(state, key)).filter((source): source is SourceConfig => !!source && validateSourceUrl(source.url) && !isSourceDisabled(state, source.key) && !isInDisabledSubscription(state, source.key));
      if (!sources.length) return null;
      const result = await api.search(title, sources, state.yellowFilter, { signal });
      for (const match of result.list.filter((item) => normalizeTitle(item.name) === normalizeTitle(title))) {
        const source = sources.find((entry) => entry.key === match.sourceKey);
        if (!source) continue;
        try {
          const detail = await api.detail(match.vodId, source, signal);
          const selected = Array.from({ length: episodeCount }, (_, i) => {
            const grouped = detail.episodeNames?.findIndex((name) => new RegExp(`^第0*${i + 1}[期集](?:上|$)`).test(name.trim())) ?? -1;
            const index = grouped >= 0 ? grouped : detail.episodes.length === episodeCount ? i : -1;
            return index < 0 ? undefined : { url: detail.episodes[index], name: detail.episodeNames?.[index] };
          });
          if (selected.some(Boolean)) return selected;
        } catch { if (signal.aborted) throw new Error('已取消'); }
      }
      return null;
    },
  });
  if (!Number.isInteger(episodeCount) || episodeCount < 1 || episodeCount > 500) {
    return <section className="px-4 sm:px-8 lg:px-12"><h2 className="text-xl sm:text-2xl font-bold">剧集</h2><p className="mt-3 text-sm text-muted">暂无分集资料。</p></section>;
  }
  return <>{!!seasons.data?.length && <section className="px-4 sm:px-8 lg:px-12"><div className="flex gap-2 overflow-x-auto no-scrollbar" aria-label="选择季数"><button type="button" aria-current="true" className="btn-hero shrink-0">{title.slice(seasonBase.length).trim() || '当前季'}</button>{seasons.data.filter((entry) => normalizeTitle(entry.name) !== normalizeTitle(title)).map((entry) => <button key={`${entry.sourceKey}-${entry.vodId}`} type="button" className="btn-ghost shrink-0" onClick={() => router.push(buildSourceDetailUrl(entry, window.location.pathname + window.location.search))}>{entry.name.slice(seasonBase.length).trim() || '原系列'}</button>)}</div></section>}<EpisodeRow count={episodeCount} title={title} cover={cover} names={episodes.data?.map((entry) => entry?.name || '')} urls={episodes.data?.map((entry) => entry?.url || '')} onPlay={(index) => onPlay(index, episodes.data?.[index]?.name)} /></>;
}

function EpisodeRow({ count, title, cover, sourceName, names, urls, onPlay, reversed = false, onReverse, onCopy }: { count: number; title: string; cover?: string; sourceName?: string; names?: string[]; urls?: string[]; onPlay: (index: number) => void; reversed?: boolean; onReverse?: () => void; onCopy?: () => void }) {
  return <section aria-label="剧集列表">
    <div className="px-4 sm:px-8 lg:px-12 flex flex-wrap items-center gap-3"><h2 className="text-xl sm:text-2xl font-bold">剧集</h2><span className="text-sm text-muted">共 {count} 集{sourceName ? ` · ${sourceName}` : ''}</span>{onReverse && <button className="btn-ghost btn-sm ml-auto" onClick={onReverse}>{reversed ? '正序排列' : '倒序排列'}</button>}{onCopy && <button className="btn-ghost btn-sm" onClick={onCopy}>复制链接</button>}</div>
    <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-8 lg:px-12 py-4 snap-x scroll-pl-4 sm:scroll-pl-8 lg:scroll-pl-12">
      {Array.from({ length: count }, (_, i) => reversed ? count - 1 - i : i).map((index) => <button key={index} type="button" onClick={() => onPlay(index)} aria-label={`播放${title}第 ${index + 1} 集`} className="relative shrink-0 w-[70%] sm:w-[36%] lg:w-[25%] aspect-[16/10] rounded-2xl overflow-hidden bg-chip snap-start text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent group">
        <EpisodeImage title={title} url={urls?.[index]} cover={cover} />
        <span className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
        <span className="absolute left-4 right-4 bottom-4 text-white"><span className="block text-xs text-white/70">{title}</span><span className="block mt-1 text-lg font-semibold">{names?.[index] || `第 ${index + 1} 集`}</span>{/^20\d{6}/.test(names?.[index] || '') && <span className="block mt-1 text-xs text-white/70">{names![index].slice(0, 4)}-{names![index].slice(4, 6)}-{names![index].slice(6, 8)}</span>}</span>
      </button>)}
    </div>
  </section>;
}

function UnifiedSourceDetail(props: Parameters<typeof SourceDetail>[0]) {
  const match = useQuery({
    queryKey: ['detail-subject-match', props.title],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/douban/resolve?${new URLSearchParams({ title: props.title })}`, { signal });
      if (!response.ok) return null;
      const result = await response.json() as { item: DoubanItem | null };
      return result.item;
    },
    staleTime: 24 * 60 * 60_000, retry: false,
  });
  if (match.isLoading) return <article><DetailHero onBack={props.onBack}><h1 className="hero-title text-4xl sm:text-5xl font-black">{props.title}</h1><DetailLoadingLines /></DetailHero></article>;
  if (match.data) return <RecommendationDetail key={match.data.id} item={match.data} onBack={props.onBack} playbackSource={props} />;
  return <SourceDetail {...props} />;
}

function SourceDetail(props: { id: string; title: string; cover: string; sourceKey: string; sourceUrl: string; sourceName: string; onBack: () => void }) {
  return <RecommendationDetail item={{ id: `source:${props.sourceKey}:${props.id}`, title: props.title, cover: props.cover }} onBack={props.onBack} playbackSource={props} />;
}
