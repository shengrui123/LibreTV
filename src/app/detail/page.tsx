'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { Cover } from '@/components/home-rows';
import { useAbstract } from '@/components/home-hero';
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
      <Header />
      <main className="mx-auto max-w-6xl px-4 sm:px-8 py-7 pb-24">
        <button onClick={back} className="btn-ghost btn-sm mb-5" aria-label="返回上一页"><Icon name="chevronLeft" className="w-4 h-4" /> 返回</button>
        {!valid ? <EmptyState icon="alert" title="详情链接不完整" description="请返回首页重新选择影片" /> : isSource ? (
          <SourceDetail id={id} title={title} cover={cover} sourceKey={sourceKey} sourceUrl={sourceUrl} sourceName={sourceName} />
        ) : (
          <RecommendationDetail item={{ id, title, cover, rating: params.get('rating') || undefined, isTv: params.get('tv') === '1' }} />
        )}
      </main>
    </div>
  );
}

function RecommendationDetail({ item }: { item: DoubanItem }) {
  const abs = useAbstract(item);
  const a = abs.data;
  const still = a?.stills?.[0];
  const meta = [item.isTv || a?.episodes ? '剧集' : '电影', a?.types?.join(' / '), a?.year, a?.region, a?.episodes ? `${a.episodes} 集` : a?.duration].filter(Boolean).join(' · ');
  const rating = a?.rate || item.rating;
  return (
    <article>
      <div className="relative overflow-hidden rounded-3xl min-h-[380px] sm:min-h-[460px] flex items-end bg-chip">
        {(still || item.cover) && <Cover url={still || item.cover} alt="" eager className={`absolute inset-0 w-full h-full object-cover ${still ? '' : 'blur-xl brightness-50 scale-110'}`} />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/10" />
        <div className="relative p-6 sm:p-10 text-white">
          <h1 className="hero-title text-4xl sm:text-6xl font-black leading-tight">{item.title}</h1>
          <p className="mt-3 text-sm text-white/80">{meta}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={`/?s=${encodeURIComponent(item.title)}`} className="btn bg-white text-black px-6 py-2.5 font-semibold"><Icon name="play" className="w-4 h-4" /> 搜索并播放</Link>
            {/^[0-9]+$/.test(item.id) && <a className="btn-glass" href={`https://movie.douban.com/subject/${item.id}/`} target="_blank" rel="noopener noreferrer">豆瓣页面</a>}
          </div>
        </div>
      </div>
      <div className="glass glass-thick rounded-3xl p-6 sm:p-8 grid sm:grid-cols-[1fr_220px] gap-6 mt-6">
        <div>
          {rating && <p className="mb-4 text-xl font-bold">豆瓣 {rating}</p>}
          {a?.intro && <p className="leading-relaxed whitespace-pre-wrap">{a.intro}</p>}
          {a?.comment && <blockquote className="mt-4 text-muted border-l-2 border-brand pl-3">{a.comment}</blockquote>}
          {abs.isLoading && <LoadingState label="正在获取影片信息..." />}
          {a?.stills && a.stills.length > 1 && <div className="mt-6 flex gap-2 overflow-x-auto">{a.stills.slice(1, 6).map((s) => <div key={s} className="shrink-0 w-40 aspect-video rounded-xl overflow-hidden"><Cover url={s} alt="" className="w-full h-full object-cover" /></div>)}</div>}
        </div>
        <dl className="text-sm space-y-3">{a?.directors?.length ? <div><dt className="text-faint">导演</dt><dd>{a.directors.join(' / ')}</dd></div> : null}{a?.actors?.length ? <div><dt className="text-faint">主演</dt><dd>{a.actors.join(' / ')}</dd></div> : null}{a?.region && <div><dt className="text-faint">地区</dt><dd>{a.region}</dd></div>}</dl>
      </div>
    </article>
  );
}

function SourceDetail({ id, title, cover, sourceKey, sourceUrl, sourceName }: { id: string; title: string; cover: string; sourceKey: string; sourceUrl: string; sourceName: string }) {
  const router = useRouter();
  const store = useAppStore();
  const { verified } = useAuth();
  const { toast } = useToast();
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  const [reversed, setReversed] = useState(false);
  useEffect(() => {
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
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
      <div className="glass glass-thick rounded-3xl p-5 sm:p-8 flex gap-5 sm:gap-8 items-start">
        {(cover || info?.cover) && <Cover url={cover || info?.cover} alt={title} eager className="w-28 sm:w-48 aspect-[2/3] object-cover rounded-xl shrink-0" />}
        <div className="min-w-0"><h1 className="text-3xl sm:text-5xl font-bold break-words">{title}</h1><p className="mt-3 text-muted">{meta}</p><p className="mt-2 text-sm text-faint">{source?.name || sourceName}</p>{info?.director && <p className="mt-2 text-sm text-muted">导演 {info.director}</p>}{info?.actor && <p className="mt-2 text-sm text-muted">主演 {info.actor}</p>}{info?.desc && <p className="mt-5 text-sm leading-relaxed whitespace-pre-wrap">{info.desc}</p>}</div>
      </div>
      <div className="glass glass-thick rounded-3xl p-5 sm:p-8 mt-5">
        {!hydrated || (!!source && query.isLoading) ? <LoadingState label="正在获取剧集信息..." /> : !source ? <ErrorState message="点播源配置不存在，请在设置中重新添加" /> : query.isError ? <ErrorState message={query.error instanceof Error ? query.error.message : '获取详情失败'} /> : detail && episodes.length ? <>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4"><h2 className="text-xl font-bold">剧集 · {episodes.length} 集</h2><div className="flex gap-2"><button className="btn-ghost btn-sm" onClick={() => setReversed(!reversed)}>{reversed ? '正序排列' : '倒序排列'}</button><button className="btn-ghost btn-sm" onClick={async () => toast(await copyToClipboard(episodes.join('\n')) ? '播放链接已复制' : '复制失败，请检查浏览器权限')}>复制链接</button></div></div>
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">{episodes.map((_, i) => reversed ? episodes.length - 1 - i : i).map((index) => <button key={index} className="btn-ghost btn-sm" onClick={() => play(index)}>{index + 1}</button>)}</div>
        </> : detail ? <EmptyState icon="alert" title="未找到播放资源" description="请尝试其他视频" /> : null}
      </div>
    </article>
  );
}
