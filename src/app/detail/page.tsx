'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { Cover } from '@/components/home-rows';
import { useAbstract } from '@/components/home-hero';
import { useTmdbHero } from '@/components/use-tmdb-hero';
import { Icon } from '@/components/icon';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { useAuth } from '@/components/auth';
import { useAppStore, resolveSource } from '@/lib/store';
import { api } from '@/lib/client-api';
import { buildWatchUrl } from '@/lib/utils';
import { formatRemarks } from '@/lib/remarks';
import { addSearchHistory } from '@/lib/db';
import { copyToClipboard } from '@/lib/clipboard';
import { useToast } from '@/components/toast';
import type { DoubanItem } from '@/lib/types';

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
      <Header transparent />
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
function DetailHero({ image, fallback, onBack, children }: { image?: string; fallback?: boolean; onBack: () => void; children: ReactNode }) {
  return (
    <section data-hero className="relative isolate overflow-hidden min-h-[560px] sm:min-h-[620px] lg:min-h-[min(80vh,760px)] flex items-end bg-[#111] text-white">
      {image && <Cover url={image} alt="" eager className={`absolute inset-0 w-full h-full object-cover ${fallback ? 'blur-2xl brightness-50 scale-110' : ''}`} />}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-black/10" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black/25" />
      {fallback && image && <div aria-hidden className="absolute right-4 sm:right-8 lg:right-12 top-32 w-24 sm:w-44 lg:w-52 aspect-[2/3] overflow-hidden rounded-2xl shadow-2xl opacity-90"><Cover url={image} alt="" eager className="w-full h-full object-cover" /></div>}
      <button onClick={onBack} aria-label="返回上一页" className="btn-icon-glass absolute top-20 left-4 sm:left-8 lg:left-12 z-20"><Icon name="chevronLeft" className="w-5 h-5" /></button>
      <div className="relative z-10 w-full px-4 sm:px-8 lg:px-12 pt-32 pb-10 sm:pb-14">{children}</div>
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

function RecommendationDetail({ item, onBack }: { item: DoubanItem; onBack: () => void }) {
  const abs = useAbstract(item);
  const tmdb = useTmdbHero(item.id, true);
  const [logoFailed, setLogoFailed] = useState(false);
  useEffect(() => setLogoFailed(false), [tmdb.data?.logo]);
  const [stillIndex, setStillIndex] = useState(0);
  useEffect(() => setStillIndex(0), [item.id]);
  const a = abs.data;
  const stills = a?.stills ?? [];
  const still = stills[stillIndex];
  const meta = [item.isTv || a?.episodes ? '剧集' : '电影', a?.types?.join(' / '), a?.year, a?.region, a?.episodes ? `${a.episodes} 集` : a?.duration].filter(Boolean).join(' · ');
  const rating = a?.rate || item.rating;
  return (
    <article>
      <DetailHero image={still || item.cover} fallback={!still} onBack={onBack}>
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
            <Link href={`/?s=${encodeURIComponent(item.title)}`} className="btn bg-white text-black px-6 py-2.5 text-[15px] font-semibold hover:bg-white/90"><Icon name="play" className="w-4 h-4" /> 搜索并播放</Link>
            {/^[0-9]+$/.test(item.id) && <a className="btn-glass" href={`https://movie.douban.com/subject/${item.id}/`} target="_blank" rel="noopener noreferrer">豆瓣页面</a>}
            <ShareButton title={item.title} />
          </div>
        </div>
      </DetailHero>
      <div className="space-y-10 pt-8 sm:pt-10">
        {abs.isLoading && <div className="px-4 sm:px-8 lg:px-12"><LoadingState label="正在获取影片信息..." /></div>}
        {abs.isError && <p role="status" className="px-4 sm:px-8 lg:px-12 text-sm text-muted">影片资料暂时无法获取，请稍后重试。</p>}
        {stills.length > 1 && <section aria-label="影片剧照"><h2 className="px-4 sm:px-8 lg:px-12 text-xl sm:text-2xl font-bold">影片剧照</h2><div className="flex gap-3 overflow-x-auto no-scrollbar px-4 sm:px-8 lg:px-12 py-4 snap-x">{stills.map((url, i) => <button key={`${url}-${i}`} type="button" onClick={() => { setStillIndex(i); window.scrollTo({ top: 0, behavior: 'smooth' }); }} aria-label={`查看第 ${i + 1} 张剧照`} aria-pressed={i === stillIndex} className="shrink-0 w-[72%] sm:w-[38%] lg:w-[25%] aspect-video rounded-2xl overflow-hidden bg-chip snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><Cover url={url} alt="" className="w-full h-full object-cover" /></button>)}</div></section>}
        {(a?.directors?.length || a?.actors?.length) ? <section aria-label="演职人员" className="px-4 sm:px-8 lg:px-12"><h2 className="text-xl sm:text-2xl font-bold mb-4">演职人员</h2><div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">{a?.directors?.map((name, i) => <div key={`director-${i}`} className="glass glass-thick rounded-2xl p-4 min-w-[144px]"><p className="font-semibold">{name}</p><p className="text-sm text-muted mt-1">导演</p></div>)}{a?.actors?.map((name, i) => <div key={`actor-${i}`} className="glass glass-thick rounded-2xl p-4 min-w-[144px]"><p className="font-semibold">{name}</p><p className="text-sm text-muted mt-1">演员</p></div>)}</div></section> : null}
        {(a?.intro || a?.comment) && <section className="px-4 sm:px-8 lg:px-12 max-w-4xl"><h2 className="text-xl sm:text-2xl font-bold mb-4">简介</h2>{a.intro && <p className="text-muted leading-relaxed whitespace-pre-wrap">{a.intro}</p>}{a.comment && <blockquote className="mt-4 text-muted border-l-2 border-brand pl-3">{a.comment}</blockquote>}</section>}
      </div>
    </article>
  );
}

function SourceDetail({ id, title, cover, sourceKey, sourceUrl, sourceName, onBack }: { id: string; title: string; cover: string; sourceKey: string; sourceUrl: string; sourceName: string; onBack: () => void }) {
  const router = useRouter();
  const store = useAppStore();
  const { verified } = useAuth();
  const { toast } = useToast();
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  const [reversed, setReversed] = useState(false);
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
  const play = (index: number) => {
    void addSearchHistory(title).catch(() => {});
    router.push(buildWatchUrl({ sourceKey, vodId: id, index, title, sourceUrl: sourceUrl || source?.url }));
  };
  return (
    <article>
      <DetailHero image={cover || info?.cover} fallback onBack={onBack}>
        <div className="max-w-[660px]">
          <h1 className="hero-title text-4xl sm:text-5xl lg:text-[56px] font-black leading-tight break-words">{title}</h1>
          <p className="mt-3 text-sm sm:text-base text-white/85">{meta}</p>
          <p className="mt-2 text-sm text-white/70">{source?.name || sourceName}</p>
          {info?.desc && <p className="mt-4 text-sm sm:text-base text-white/75 leading-relaxed line-clamp-3">{info.desc}</p>}
          <div className="mt-6 flex items-center gap-2.5">{episodes.length > 0 && <button className="btn bg-white text-black px-6 py-2.5 text-[15px] font-semibold hover:bg-white/90" onClick={() => play(0)}><Icon name="play" className="w-4 h-4" /> 播放</button>}<ShareButton title={title} /></div>
        </div>
      </DetailHero>
      <div className="px-4 sm:px-8 lg:px-12 pt-8 sm:pt-10 max-w-[1680px] mx-auto">
        {!hydrated || (!!source && query.isLoading) ? <LoadingState label="正在获取剧集信息..." /> : !source ? <ErrorState message="点播源配置不存在，请在设置中重新添加" /> : query.isError ? <ErrorState message={query.error instanceof Error ? query.error.message : '获取详情失败'} /> : detail && episodes.length ? <section>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><h2 className="text-xl sm:text-2xl font-bold">剧集 · {episodes.length} 集</h2><div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => setReversed(!reversed)}>{reversed ? '正序排列' : '倒序排列'}</button><button className="btn-ghost btn-sm" onClick={async () => toast(await copyToClipboard(episodes.join('\n')) ? '播放链接已复制' : '复制失败，请检查浏览器权限')}>复制链接</button></div></div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">{episodes.map((_, i) => reversed ? episodes.length - 1 - i : i).map((index) => <button key={index} className="btn-ghost btn-sm" onClick={() => play(index)}>{index + 1}</button>)}</div>
        </section> : detail ? <EmptyState icon="alert" title="未找到播放资源" description="请尝试其他视频" /> : null}
        {(info?.director || info?.actor) && <section className="mt-10"><h2 className="text-xl sm:text-2xl font-bold mb-4">演职人员</h2><div className="glass glass-thick rounded-2xl p-5 text-sm space-y-2">{info.director && <p><span className="text-faint">导演 </span>{info.director}</p>}{info.actor && <p><span className="text-faint">主演 </span>{info.actor}</p>}</div></section>}
        {info?.desc && <section className="mt-10 max-w-4xl"><h2 className="text-xl sm:text-2xl font-bold mb-4">简介</h2><p className="text-muted leading-relaxed whitespace-pre-wrap">{info.desc}</p></section>}
      </div>
    </article>
  );
}
