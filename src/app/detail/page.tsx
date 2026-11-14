'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Cover, Row, PosterCard, POSTER_W } from '@/components/home-rows';
import { CastPortrait } from '@/components/cast-portrait';
import { buildRecommendationDetailUrl, buildSourceDetailUrl } from '@/lib/detail-url';
import { useAbstract } from '@/components/home-hero';
import { useTmdbHero } from '@/components/use-tmdb-hero';
import { Icon } from '@/components/icon';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useAuth } from '@/components/auth';
import { useAppStore, resolveSource, isSourceDisabled, isInDisabledSubscription, readQuality } from '@/lib/store';
import { api } from '@/lib/client-api';
import { buildWatchUrl, validateSourceUrl } from '@/lib/utils';
import { formatRemarks } from '@/lib/remarks';
import { addSearchHistory } from '@/lib/db';
import { copyToClipboard } from '@/lib/clipboard';
import { useToast } from '@/components/toast';
import type { DoubanItem, SearchResultItem, SourceConfig } from '@/lib/types';

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
          <SourceDetail id={id} title={title} cover={cover} sourceKey={sourceKey} sourceUrl={sourceUrl} sourceName={sourceName} onBack={back} />
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
      {stills?.length ? stills.map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={`${url}-${i}`} src={url} alt="" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 motion-reduce:transition-none ${i === stillIndex ? 'opacity-100' : 'opacity-0'}`} />)) : image && <Cover url={image} alt="" eager className={`absolute inset-0 w-full h-full object-cover ${fallback ? 'blur-2xl brightness-50 scale-110' : ''}`} />}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-black/10" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/25" />
      {fallback && image && <div aria-hidden className="absolute right-4 sm:right-8 lg:right-12 top-32 w-24 sm:w-44 lg:w-52 aspect-[2/3] overflow-hidden rounded-2xl shadow-2xl opacity-90"><Cover url={image} alt="" eager className="w-full h-full object-cover" /></div>}
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

/** 从可播放的视频中截取画面；无法跨域读取或分辨率不足时保留海报。 */
function useVideoFrames(title: string) {
  const [frames, setFrames] = useState<string[]>([]);
  const { verified } = useAuth();
  const sourceKeys = useAppStore((state) => state.selectedKeys);
  useEffect(() => {
    setFrames([]);
    if (!verified) return;
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
      const state = useAppStore.getState();
      const sources = [...new Set(state.selectedKeys)].map((key) => resolveSource(state, key)).filter((source): source is SourceConfig => !!source && validateSourceUrl(source.url) && !isSourceDisabled(state, source.key) && !isInDisabledSubscription(state, source.key));
      if (!sources.length) return;
      const result = await api.search(title, sources, state.yellowFilter, { signal: controller.signal });
      const matches = result.list.filter((item) => item.name.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase());
      for (const match of matches) {
        if (controller.signal.aborted) return;
        const source = sources.find((entry) => entry.key === match.sourceKey);
        if (!source) continue;
        try {
          const detail = await api.detail(match.vodId, source, controller.signal);
          const url = detail.episodes[0];
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
          for (const fraction of [0.2, 0.5, 0.8]) {
            const seeked = waitFor('seeked');
            video.currentTime = video.duration * fraction;
            await seeked;
            if (video.videoWidth < 1280 || video.videoHeight < 720) throw new Error('视频分辨率不足');
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d')?.drawImage(video, 0, 0);
            images.push(canvas.toDataURL('image/jpeg', 0.8));
          }
          if (!controller.signal.aborted) setFrames(images);
          return;
        } catch { hls?.destroy(); hls = undefined; video.removeAttribute('src'); video.load(); }
      }
    })().catch(() => {});
    return () => { controller.abort(); hls?.destroy(); video.removeAttribute('src'); video.load(); };
  }, [title, verified, sourceKeys]);
  return frames;
}

function RecommendationDetail({ item, onBack }: { item: DoubanItem; onBack: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [playing, setPlaying] = useState(false);
  const [trailer, setTrailer] = useState<{ id: string; title: string } | null>(null);
  useEffect(() => {
    if (!trailer) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setTrailer(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [trailer]);
  const playNow = async (index = 0) => {
    if (playing) return;
    const state = useAppStore.getState();
    const sources = [...new Set(state.selectedKeys)].map((key) => resolveSource(state, key)).filter((source): source is NonNullable<typeof source> => !!source && validateSourceUrl(source.url) && !isSourceDisabled(state, source.key) && !isInDisabledSubscription(state, source.key));
    if (!sources.length) { toast('请先在设置中添加并启用点播源', 'warning'); return; }
    setPlaying(true);
    try {
      const result = await api.search(item.title, sources, state.yellowFilter);
      const matches = result.list.filter((candidate) => candidate.name.trim().toLocaleLowerCase() === item.title.trim().toLocaleLowerCase());
      const probes = await Promise.all(matches.map(async (candidate) => {
        const source = sources.find((entry) => entry.key === candidate.sourceKey);
        if (!source) return null;
        const probe = await api.detailSpeed(candidate.vodId, source);
        return probe.ok && probe.detail && probe.detail.episodes.length > index ? { candidate, source, ms: probe.ms } : null;
      }));
      const available = probes.filter((p): p is NonNullable<typeof p> => p !== null);
      if (!available.length) { toast('没有找到这一集的播放资源', 'warning'); return; }
      const heights = new Map<string, number>();
      const missing = available.filter(({ candidate, source }) => {
        const cached = readQuality(source.key, candidate.vodId);
        if (cached?.height) heights.set(`${source.key}:${candidate.vodId}`, cached.height);
        return !cached?.height;
      });
      try {
        for (let i = 0; i < missing.length; i += 50) {
          await api.qualityProbeStream(missing.slice(i, i + 50).map(({ candidate, source }) => ({ source, id: candidate.vodId })), (result) => {
            if (result.height) heights.set(`${result.sourceKey}:${result.vodId}`, result.height);
          });
        }
      } catch { /* 画质探测不可用时仍可播放已找到的资源 */ }
      const best = available.sort((a, b) => (heights.get(`${b.source.key}:${b.candidate.vodId}`) ?? 0) - (heights.get(`${a.source.key}:${a.candidate.vodId}`) ?? 0) || a.ms - b.ms)[0];
      if (!heights.size) toast('未能识别资源画质，已选择可用源', 'info');
      else if (heights.size < available.length) toast('部分资源画质无法识别，已选择已知最高画质', 'info');
      void addSearchHistory(item.title).catch(() => {});
      router.push(buildWatchUrl({ sourceKey: best.source.key, vodId: best.candidate.vodId, index, title: item.title, sourceUrl: best.source.url, detail: best.source.detail }));
    } catch { toast('搜索播放源失败，请稍后重试', 'error'); }
    finally { setPlaying(false); }
  };
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
  const a = abs.data;
  const stills = a?.stills ?? [];
  const frames = useVideoFrames(item.title);
  useEffect(() => {
    if (frames.length < 2) return;
    const timer = window.setTimeout(() => setStillIndex((index) => (index + 1) % frames.length), 8000);
    return () => window.clearTimeout(timer);
  }, [stillIndex, frames.length]);
  const meta = [item.isTv || a?.episodes ? '剧集' : '电影', a?.types?.join(' / '), a?.year, a?.region, a?.episodes ? `${a.episodes} 集` : a?.duration].filter(Boolean).join(' · ');
  const rating = a?.rate || item.rating;
  return (
    <article>
      <DetailHero image={item.cover} fallback={!frames.length} onBack={onBack} stills={frames} stillIndex={stillIndex} onSelectStill={setStillIndex}>
        <div className="max-w-[660px]">
          {tmdb.data?.logo && !logoFailed ? (
            <h1>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={tmdb.data.logo} alt={item.title} className="max-w-full max-h-24 sm:max-h-32 object-contain object-left" onError={() => setLogoFailed(true)} />
            </h1>
          ) : <h1 className="hero-title text-4xl sm:text-5xl lg:text-[56px] font-black leading-tight">{item.title}</h1>}
          <p className="mt-3 text-sm sm:text-base text-white/85">{meta}</p>
          {a?.intro && <p className="mt-4 text-sm sm:text-base leading-relaxed text-white/75 line-clamp-3">{a.intro}</p>}
          {(rating || tmdb.data?.score) && <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-white">{rating && <span>豆瓣 {rating}</span>}{tmdb.data?.score && <span>TMDB {tmdb.data.score}</span>}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <button onClick={() => void playNow()} disabled={playing} className="btn bg-white text-black px-6 py-2.5 text-[15px] font-semibold hover:bg-white/90"><Icon name="play" className="w-4 h-4" /> {playing ? '正在查找播放源…' : '立即播放'}</button>
            {/^[0-9]+$/.test(item.id) && <a className="btn-icon-glass" href={`https://movie.douban.com/subject/${item.id}/`} target="_blank" rel="noopener noreferrer" aria-label="打开豆瓣页面" title="打开豆瓣页面">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="https://www.douban.com/favicon.ico" alt="" className="w-5 h-5 rounded-sm" />
            </a>}
            <ShareButton title={item.title} />
          </div>
        </div>
      </DetailHero>
      <div className="space-y-10 pt-8 sm:pt-10">
        {(item.isTv || !!a?.episodes) && <RecommendedEpisodes title={item.title} cover={item.cover} count={a?.episodes} onPlay={(index) => { void playNow(index); }} />}
        <section aria-label="预告片"><h2 className="px-4 sm:px-8 lg:px-12 text-xl sm:text-2xl font-bold">预告片</h2>{extras.isLoading ? <p className="px-4 sm:px-8 lg:px-12 mt-3 text-sm text-muted">正在获取预告片…</p> : extras.data?.trailers?.length ? <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-8 lg:px-12 py-4 snap-x scroll-pl-4 sm:scroll-pl-8 lg:scroll-pl-12">{extras.data.trailers.map((trailer) => <button key={trailer.id} type="button" onClick={() => setTrailer({ id: trailer.id, title: trailer.title })} className="shrink-0 w-[72%] sm:w-[38%] lg:w-[25%] text-left snap-start group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-2xl"><div className="relative aspect-video overflow-hidden rounded-2xl bg-chip"><Cover url={trailer.cover} alt="" className="w-full h-full object-cover" /><span className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" /><span className="absolute inset-0 flex items-center justify-center"><span className="glass glass-clear glass-dark rounded-full p-3"><Icon name="play" className="w-5 h-5" /></span></span>{trailer.runtime && <span className="absolute right-3 bottom-3 text-xs text-white">{trailer.runtime}</span>}</div><span className="block mt-2 text-sm font-medium text-content line-clamp-2">{trailer.title}</span></button>)}</div> : <p className="px-4 sm:px-8 lg:px-12 mt-3 text-sm text-muted">暂无预告片</p>}</section>
        {abs.isLoading && <div className="px-4 sm:px-8 lg:px-12"><LoadingState label="正在获取影片信息..." /></div>}
        {abs.isError && <p role="status" className="px-4 sm:px-8 lg:px-12 text-sm text-muted">影片资料暂时无法获取，请稍后重试。</p>}
        {stills.length > 1 && <section aria-label="影片剧照"><h2 className="px-4 sm:px-8 lg:px-12 text-xl sm:text-2xl font-bold">影片剧照</h2><div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-8 lg:px-12 py-4 snap-x scroll-pl-4 sm:scroll-pl-8 lg:scroll-pl-12">{stills.map((url, i) => <div key={`${url}-${i}`} className="shrink-0 w-[72%] sm:w-[38%] lg:w-[25%] aspect-video rounded-2xl overflow-hidden bg-chip snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Cover url={url} alt="" className="w-full h-full object-cover" /></div>)}</div></section>}
        {(a?.directors?.length || a?.actors?.length) ? <section aria-label="演职人员" className="px-4 sm:px-8 lg:px-12"><h2 className="text-xl sm:text-2xl font-bold mb-4">演职人员</h2><div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">{a?.directors?.map((name, i) => <div key={`director-${i}`} className="glass glass-thick rounded-2xl p-4 w-36 shrink-0">{(extras.data?.people ?? a.people)?.find((p) => p.name === name && p.role === '导演')?.photo && <CastPortrait url={(extras.data?.people ?? a.people)?.find((p) => p.name === name && p.role === '导演')?.photo} name={name} />}<p className="font-semibold">{name}</p><p className="text-sm text-muted mt-1">导演</p></div>)}{a?.actors?.map((name, i) => <div key={`actor-${i}`} className="glass glass-thick rounded-2xl p-4 w-36 shrink-0">{(extras.data?.people ?? a.people)?.find((p) => p.name === name && p.role === '演员')?.photo && <CastPortrait url={(extras.data?.people ?? a.people)?.find((p) => p.name === name && p.role === '演员')?.photo} name={name} />}<p className="font-semibold">{name}</p><p className="text-sm text-muted mt-1">演员</p></div>)}</div></section> : null}
        {(a?.intro || a?.comment) && <section className="px-4 sm:px-8 lg:px-12 max-w-4xl"><h2 className="text-xl sm:text-2xl font-bold mb-4">简介</h2>{a.intro && <p className="text-muted leading-relaxed whitespace-pre-wrap">{a.intro}</p>}{a.comment && <blockquote className="mt-4 text-muted border-l-2 border-brand pl-3">{a.comment}</blockquote>}</section>}
        {!!extras.data?.items.length && <Row title="相关推荐">{extras.data.items.map((recommendation) => <PosterCard key={recommendation.id} item={recommendation} className={POSTER_W} showTitle onOpen={(picked) => router.push(buildRecommendationDetailUrl(picked, window.location.pathname + window.location.search))} />)}</Row>}
      </div>
      {trailer && <div className="fixed inset-0 z-[100] bg-black/85 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={trailer.title} onClick={() => setTrailer(null)}><div className="relative w-full max-w-4xl" onClick={(event) => event.stopPropagation()}><button type="button" className="btn-icon-glass absolute -top-12 right-0" aria-label="关闭预告片" onClick={() => setTrailer(null)}><Icon name="close" className="w-5 h-5" /></button><video className="w-full max-h-[75vh] rounded-2xl bg-black" src={`/api/douban/trailer?id=${encodeURIComponent(trailer.id)}`} controls autoPlay playsInline onError={() => toast('预告片暂不可用，请稍后重试', 'warning')} /></div></div>}
    </article>
  );
}

function RecommendedEpisodes({ title, cover, count, onPlay }: { title: string; cover?: string; count?: string; onPlay: (index: number) => void }) {
  const episodeCount = Number(count);
  if (!Number.isInteger(episodeCount) || episodeCount < 1 || episodeCount > 500) {
    return <section className="px-4 sm:px-8 lg:px-12"><h2 className="text-xl sm:text-2xl font-bold">剧集</h2><p className="mt-3 text-sm text-muted">暂无分集资料。</p></section>;
  }
  return <EpisodeRow count={episodeCount} title={title} cover={cover} onPlay={onPlay} />;
}

function EpisodeRow({ count, title, cover, sourceName, names, onPlay, reversed = false, onReverse, onCopy }: { count: number; title: string; cover?: string; sourceName?: string; names?: string[]; onPlay: (index: number) => void; reversed?: boolean; onReverse?: () => void; onCopy?: () => void }) {
  return <section aria-label="剧集列表">
    <div className="px-4 sm:px-8 lg:px-12 flex flex-wrap items-center gap-3"><h2 className="text-xl sm:text-2xl font-bold">剧集</h2><span className="text-sm text-muted">共 {count} 集{sourceName ? ` · ${sourceName}` : ''}</span>{onReverse && <button className="btn-ghost btn-sm ml-auto" onClick={onReverse}>{reversed ? '正序排列' : '倒序排列'}</button>}{onCopy && <button className="btn-ghost btn-sm" onClick={onCopy}>复制链接</button>}</div>
    <div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-8 lg:px-12 py-4 snap-x scroll-pl-4 sm:scroll-pl-8 lg:scroll-pl-12">
      {Array.from({ length: count }, (_, i) => reversed ? count - 1 - i : i).map((index) => <button key={index} type="button" onClick={() => onPlay(index)} aria-label={`播放${title}第 ${index + 1} 集`} className="relative shrink-0 w-[70%] sm:w-[36%] lg:w-[25%] aspect-[16/10] rounded-2xl overflow-hidden bg-chip snap-start text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent group">
        {cover && <Cover url={cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 blur-sm scale-110" />}
        <span className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/10" />
        <span className="absolute left-4 right-4 bottom-4 text-white"><span className="block text-xs text-white/70">{title}</span><span className="block mt-1 text-lg font-semibold">{names?.[index] || `第 ${index + 1} 集`}</span>{/^20\d{6}/.test(names?.[index] || '') && <span className="block mt-1 text-xs text-white/70">{names![index].slice(0, 4)}-{names![index].slice(4, 6)}-{names![index].slice(6, 8)}</span>}</span>
      </button>)}
    </div>
  </section>;
}

function SourceDetail({ id, title, cover, sourceKey, sourceUrl, sourceName, onBack }: { id: string; title: string; cover: string; sourceKey: string; sourceUrl: string; sourceName: string; onBack: () => void }) {
  const router = useRouter();
  const store = useAppStore();
  const { verified } = useAuth();
  const { toast } = useToast();
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  const [reversed, setReversed] = useState(false);
  const frames = useVideoFrames(title);
  const [frameIndex, setFrameIndex] = useState(0);
  useEffect(() => setFrameIndex(0), [title]);
  useEffect(() => {
    if (frames.length < 2) return;
    const timer = window.setTimeout(() => setFrameIndex((index) => (index + 1) % frames.length), 8000);
    return () => window.clearTimeout(timer);
  }, [frameIndex, frames.length]);
  const [alternatives, setAlternatives] = useState<SearchResultItem[]>([]);
  const params = useSearchParams();
  const [playingSource, setPlayingSource] = useState(false);
  const seasonBase = title.replace(/\s*(?:第[一二三四五六七八九十百零〇0-9]+季|[Ss]eason\s*\d+|第[一二三四五六七八九十百零〇0-9]+部)\s*$/, '').trim();
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem('libretv-detail-sources') || '[]');
      if (Array.isArray(saved) && saved.some((entry) => entry?.sourceKey === sourceKey && entry?.vodId === id && entry?.name === title)) {
        setAlternatives(saved.filter((entry): entry is SearchResultItem => typeof entry?.sourceKey === 'string' && typeof entry?.vodId === 'string' && entry?.name === title && typeof entry?.sourceName === 'string'));
      } else setAlternatives([]);
    } catch { setAlternatives([]); }
  }, [id, sourceKey, title]);
  useEffect(() => {
    const unsubscribe = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, []);
  const source = resolveSource(store, sourceKey, { url: sourceUrl, name: sourceName });
  const query = useQuery({
    queryKey: ['source-detail', sourceKey, id, source?.url],
    queryFn: ({ signal }) => api.detail(id, source!, signal),
    enabled: !!verified && hydrated && !!source,
    retry: false,
  });
  const detail = query.data;
  const info = detail?.videoInfo;
  const episodes = detail?.episodes ?? [];
  const meta = [info?.typeName, info?.year, info?.area, formatRemarks(info?.remarks)].filter(Boolean).join(' · ');
  const seasons = useQuery({
    queryKey: ['source-seasons', seasonBase, store.selectedKeys, store.yellowFilter],
    enabled: hydrated && !!verified && !!seasonBase && seasonBase !== title,
    staleTime: 5 * 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const sources = [...new Set(store.selectedKeys)].map((key) => resolveSource(store, key)).filter((entry): entry is SourceConfig => !!entry && validateSourceUrl(entry.url) && !isSourceDisabled(store, entry.key) && !isInDisabledSubscription(store, entry.key));
      if (!sources.length) return [];
      const result = await api.search(seasonBase, sources, store.yellowFilter, { signal });
      const pattern = /^(?:第[一二三四五六七八九十百零〇0-9]+季|[Ss]eason\s*\d+|第[一二三四五六七八九十百零〇0-9]+部)$/;
      return result.list.filter((entry) => entry.name.startsWith(seasonBase) && pattern.test(entry.name.slice(seasonBase.length).trim())).filter((entry, i, all) => all.findIndex((other) => other.name === entry.name) === i);
    },
  });
  const play = async (index: number) => {
    if (playingSource || !source || !episodes[index]) return;
    setPlayingSource(true);
    try {
      const currentName = detail?.episodeNames?.[index]?.trim();
      const choices = [{ source, vodId: id, index, ms: 0 }];
      const state = useAppStore.getState();
      const activeSources = [...new Set(state.selectedKeys)].map((key) => resolveSource(state, key)).filter((entry): entry is SourceConfig => !!entry && validateSourceUrl(entry.url) && !isSourceDisabled(state, entry.key) && !isInDisabledSubscription(state, entry.key));
      const found = activeSources.length ? await api.search(title, activeSources, state.yellowFilter).catch(() => ({ list: [] as SearchResultItem[] })) : { list: [] as SearchResultItem[] };
      const candidates = [...alternatives, ...found.list.filter((entry) => entry.name.trim() === title.trim())].filter((entry, i, all) => all.findIndex((other) => other.sourceKey === entry.sourceKey && other.vodId === entry.vodId) === i);
      const probes = await Promise.all(candidates.filter((entry) => entry.sourceKey !== sourceKey || entry.vodId !== id).map(async (entry) => {
        const candidate = resolveSource(useAppStore.getState(), entry.sourceKey, { url: entry.sourceUrl, name: entry.sourceName });
        if (!candidate || !validateSourceUrl(candidate.url) || isSourceDisabled(useAppStore.getState(), candidate.key) || isInDisabledSubscription(useAppStore.getState(), candidate.key)) return null;
        const probe = await api.detailSpeed(entry.vodId, candidate);
        if (!probe.ok || !probe.detail) return null;
        const candidateIndex = currentName && probe.detail.episodeNames ? probe.detail.episodeNames.findIndex((name) => name.trim() === currentName) : -1;
        const matchedIndex = candidateIndex >= 0 ? candidateIndex : !currentName && probe.detail.episodes.length === episodes.length ? index : -1;
        return matchedIndex >= 0 && probe.detail.episodes[matchedIndex] ? { source: candidate, vodId: entry.vodId, index: matchedIndex, ms: probe.ms } : null;
      }));
      choices.push(...probes.filter((entry): entry is NonNullable<typeof entry> => entry !== null));
      const heights = new Map<string, number>();
      for (const choice of choices) { const height = readQuality(choice.source.key, choice.vodId)?.height; if (height) heights.set(`${choice.source.key}:${choice.vodId}`, height); }
      try {
        await api.qualityProbeStream(choices.map((choice) => ({ source: choice.source, id: choice.vodId })), (result) => { if (result.height) heights.set(`${result.sourceKey}:${result.vodId}`, result.height); });
      } catch { /* 画质未知时保留可播放来源 */ }
      const best = choices.sort((a, b) => (heights.get(`${b.source.key}:${b.vodId}`) ?? 0) - (heights.get(`${a.source.key}:${a.vodId}`) ?? 0) || a.ms - b.ms)[0];
      if (heights.size < choices.length) toast(heights.size ? '部分资源画质无法识别，已选择已知最高画质' : '未能识别资源画质，已选择可用源', 'info');
      void addSearchHistory(title).catch(() => {});
      router.push(buildWatchUrl({ sourceKey: best.source.key, vodId: best.vodId, index: best.index, title, sourceUrl: best.source.url, detail: best.source.detail }));
    } catch { toast('查找播放资源失败，请稍后重试', 'warning'); }
    finally { setPlayingSource(false); }
  };
  const description = info?.desc?.replace(/<[^>]*>/g, '').trim();
  return (
    <article>
      <DetailHero image={cover || info?.cover} fallback={!frames.length} onBack={onBack} stills={frames} stillIndex={frameIndex} onSelectStill={setFrameIndex}>
        <div className="max-w-[660px]">
          <h1 className="hero-title text-4xl sm:text-5xl lg:text-[56px] font-black leading-tight break-words">{title}</h1>
          <p className="mt-3 text-sm sm:text-base text-white/85">{meta}</p>
          <p className="mt-2 text-sm text-white/70">{source?.name || sourceName}</p>
          {description && <p className="mt-4 text-sm sm:text-base text-white/75 leading-relaxed line-clamp-3">{description}</p>}
          <div className="mt-6 flex items-center gap-2.5">{episodes.length > 0 && <button className="btn bg-white text-black px-6 py-2.5 text-[15px] font-semibold hover:bg-white/90" onClick={() => void play(0)} disabled={playingSource}><Icon name="play" className="w-4 h-4" /> {playingSource ? '正在查找播放源…' : '立即播放'}</button>}<ShareButton title={title} /></div>
        </div>
      </DetailHero>
      {!!seasons.data?.length && <section className="px-4 sm:px-8 lg:px-12 pt-8"><h2 className="text-lg font-semibold mb-3">全部季</h2><div className="flex gap-2 overflow-x-auto no-scrollbar">{seasons.data.map((entry) => <button key={entry.name} type="button" aria-pressed={entry.name === title} className={entry.name === title ? 'btn-hero shrink-0' : 'btn-ghost shrink-0'} onClick={() => router.push(buildSourceDetailUrl(entry, params.get('returnTo') || '/'))}>{entry.name.slice(seasonBase.length).trim()}</button>)}</div></section>}
      {episodes.length > 1 && <div className="pt-8 sm:pt-10"><EpisodeRow count={episodes.length} title={title} cover={cover || info?.cover} sourceName={source?.name || sourceName} names={detail?.episodeNames} onPlay={(index) => { void play(index); }} reversed={reversed} onReverse={() => setReversed(!reversed)} onCopy={() => { void copyToClipboard(episodes.join('\n')).then((ok) => toast(ok ? '播放链接已复制' : '复制失败，请检查浏览器权限')); }} /></div>}
      <div className="px-4 sm:px-8 lg:px-12 pt-8 sm:pt-10 max-w-[1680px] mx-auto">
        {!hydrated || (!!source && query.isLoading) ? <LoadingState label="正在获取剧集信息..." /> : !source ? <ErrorState message="点播源配置不存在，请在设置中重新添加" /> : query.isError ? <ErrorState message={query.error instanceof Error ? query.error.message : '获取详情失败'} /> : detail && episodes.length > 1 ? null : detail && episodes.length ? <section>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><h2 className="text-xl sm:text-2xl font-bold">剧集 · {episodes.length} 集</h2><div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => setReversed(!reversed)}>{reversed ? '正序排列' : '倒序排列'}</button><button className="btn-ghost btn-sm" onClick={async () => toast(await copyToClipboard(episodes.join('\n')) ? '播放链接已复制' : '复制失败，请检查浏览器权限')}>复制链接</button></div></div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">{episodes.map((_, i) => reversed ? episodes.length - 1 - i : i).map((index) => <button key={index} className="btn-ghost btn-sm" onClick={() => play(index)}>{index + 1}</button>)}</div>
        </section> : detail ? <EmptyState icon="alert" title="未找到播放资源" description="请尝试其他视频" /> : null}
        {(info?.director || info?.actor) && <section className="mt-10"><h2 className="text-xl sm:text-2xl font-bold mb-4">演职人员</h2><div className="glass glass-thick rounded-2xl p-5 text-sm space-y-2">{info.director && <p><span className="text-faint">导演 </span>{info.director}</p>}{info.actor && <p><span className="text-faint">主演 </span>{info.actor}</p>}</div></section>}
        {description && <section className="mt-10 max-w-4xl"><h2 className="text-xl sm:text-2xl font-bold mb-4">简介</h2><p className="text-muted leading-relaxed whitespace-pre-wrap">{description}</p></section>}
      </div>
    </article>
  );
}
