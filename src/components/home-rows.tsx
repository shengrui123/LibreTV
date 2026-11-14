'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { useAppStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';
import { SmartImage } from './smart-image';
import { Icon } from './icon';
import { useInView } from './use-in-view';

/* ------------------------------------------------------------------ */
/* 数据 hooks                                                          */
/* ------------------------------------------------------------------ */

const ROW_SIZE = 24;

/** 豆瓣分类数据；Hero 与「今日热门电影」共用同一个缓存键 */
export function useDoubanList(type: 'movie' | 'tv', tag: string, enabled = true) {
  return useQuery({
    queryKey: ['douban-row', type, tag, ROW_SIZE],
    queryFn: async ({ signal }) => (await api.douban(type, tag, 0, ROW_SIZE, signal)).items,
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

export function useHotList(id: string, enabled = true) {
  return useQuery({
    queryKey: ['hot-list', id],
    queryFn: async ({ signal }) => (await api.hotList(id, signal)).items,
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });
}

/** 豆瓣封面放大：s_ratio_poster → l_ratio_poster（失败时由调用方回退原图） */
export function largeCover(url?: string) {
  if (!url) return url;
  return url.replace('/s_ratio_poster/', '/l_ratio_poster/').replace('/m_ratio_poster/', '/l_ratio_poster/');
}

/** 封面图：先试大图，失败回退原图，再失败显示占位 */
export function Cover({
  url,
  alt,
  className,
  large = false,
  eager = false,
}: {
  url?: string;
  alt: string;
  className?: string;
  large?: boolean;
  eager?: boolean;
}) {
  const mode = useAppStore((s) => s.imageProxyMode);
  const customProxy = useAppStore((s) => s.customImageProxy);
  const big = large ? largeCover(url) : url;
  const [stage, setStage] = useState(0);
  useEffect(() => setStage(0), [url]);
  const src = stage === 0 ? big : stage === 1 && big !== url ? url : undefined;
  const onExhausted = useCallback(() => setStage((s) => (s === 0 && big !== url ? 1 : 2)), [big, url]);

  if (!src) {
    return (
      <div className={cn('flex items-center justify-center bg-chip text-faint', className)}>
        <Icon name="film" className="w-8 h-8 opacity-60" />
      </div>
    );
  }
  return (
    <SmartImage
      key={src}
      url={src}
      mode={mode}
      customProxy={customProxy}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      onExhausted={onExhausted}
    />
  );
}

/* ------------------------------------------------------------------ */
/* 卡片                                                                */
/* ------------------------------------------------------------------ */

export function PosterCard({
  item,
  rank,
  onOpen,
  className,
  showTitle = false,
}: {
  item: DoubanItem;
  rank?: number;
  onOpen: (item: DoubanItem) => void;
  className?: string;
  showTitle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn('group/card relative block text-left snap-start focus-visible:outline-none', className)}
      aria-label={item.title}
    >
      <div className="poster-lift relative aspect-[2/3] rounded-[10px] overflow-hidden bg-chip ring-1 ring-white/5 group-focus-visible/card:ring-[3px] group-focus-visible/card:ring-content">
        <Cover url={item.cover} alt={item.title} className="absolute inset-0 w-full h-full object-cover" />
        <div className="poster-sheen absolute inset-0 pointer-events-none" />
        {rank !== undefined && (
          <span className="absolute top-1.5 left-2 text-[15px] font-bold text-white [text-shadow:0_1px_6px_rgba(0,0,0,.9)]">
            {rank}
          </span>
        )}
        {item.rating && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 backdrop-blur px-1.5 py-0.5 text-[11px] font-semibold text-white opacity-0 group-hover/card:opacity-100 transition-opacity">
            <span className="text-rating">★</span> {item.rating}
          </span>
        )}
      </div>
      {showTitle && (
        <div className="mt-2 px-0.5 text-[13px] text-muted group-hover/card:text-content truncate transition-colors">
          {item.title}
        </div>
      )}
    </button>
  );
}

/** 大卡（Apple TV「精选」样式）：竖版大图 + 底部标题叠层 */
function FeatureCard({ item, label, onOpen }: { item: DoubanItem; label: string; onOpen: (item: DoubanItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group/card relative block shrink-0 snap-start text-left w-[62%] sm:w-[38%] md:w-[30%] lg:w-[24%] xl:w-[20%] focus-visible:outline-none"
    >
      <div className="poster-lift relative aspect-[4/5] rounded-2xl overflow-hidden bg-chip ring-1 ring-white/5 group-focus-visible/card:ring-[3px] group-focus-visible/card:ring-content">
        <Cover url={item.cover} alt={item.title} large className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        <div className="poster-sheen absolute inset-0 pointer-events-none" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="text-white text-xl sm:text-2xl font-bold leading-tight line-clamp-2 [text-shadow:0_2px_10px_rgba(0,0,0,.6)]">
            {item.title}
          </div>
          <div className="mt-1 text-[12px] text-white/70">
            {label}
            {item.rating && <> · 豆瓣 {item.rating}</>}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* 行容器                                                              */
/* ------------------------------------------------------------------ */

export const POSTER_W = 'shrink-0 w-[30%] sm:w-[22.5%] md:w-[18.4%] lg:w-[15.3%] xl:w-[13.1%] 2xl:w-[11.4%]';

export function Row({
  title,
  href,
  children,
  className,
}: {
  title: string;
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  }, []);

  useEffect(() => {
    update();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const scrollBy = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <section className={cn('group/row relative', className)}>
      <h2 className="px-4 sm:px-8 lg:px-12 mb-1 text-[17px] sm:text-xl font-bold text-content tracking-tight">
        {href ? (
          <Link href={href} className="inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity">
            {title}
            <Icon name="chevronRight" className="w-4 h-4 text-faint" />
          </Link>
        ) : (
          title
        )}
      </h2>
      <div className="relative">
        <div
          ref={scroller}
          onScroll={update}
          className="flex gap-2.5 sm:gap-3.5 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-px-4 sm:scroll-px-8 lg:scroll-px-12 px-4 sm:px-8 lg:px-12 py-3"
        >
          {children}
        </div>
        {!edges.start && (
          <RowArrow side="left" onClick={() => scrollBy(-1)} />
        )}
        {!edges.end && <RowArrow side="right" onClick={() => scrollBy(1)} />}
      </div>
    </section>
  );
}

function RowArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === 'left' ? '向左滚动' : '向右滚动'}
      onClick={onClick}
      className={cn(
        'hidden sm:flex absolute top-3 bottom-3 w-8 lg:w-12 items-center justify-center z-10',
        'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 transition-opacity',
        'text-white bg-gradient-to-r',
        side === 'left' ? 'left-0 from-black/80 to-transparent' : 'right-0 from-transparent to-black/80'
      )}
    >
      <span className="grid place-items-center w-9 h-9 rounded-full bg-black/50 backdrop-blur ring-1 ring-white/15 hover:scale-110 transition-transform">
        <Icon name={side === 'left' ? 'chevronLeft' : 'chevronRight'} className="w-5 h-5" />
      </span>
    </button>
  );
}

function RowSkeleton({ feature = false }: { feature?: boolean }) {
  return (
    <>
      {Array.from({ length: feature ? 5 : 9 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'rounded-[10px] bg-chip animate-pulse',
            feature ? 'shrink-0 w-[62%] sm:w-[38%] md:w-[30%] lg:w-[24%] xl:w-[20%] aspect-[4/5] rounded-2xl' : cn(POSTER_W, 'aspect-[2/3]')
          )}
        />
      ))}
    </>
  );
}

/** 懒加载行：进入视口才请求，失败或为空时整行隐藏 */
function LazyRow({ minHeight = 260, children }: { minHeight?: number; children: (visible: boolean) => ReactNode }) {
  const { ref, inView } = useInView<HTMLDivElement>(true, 0);
  return (
    <div ref={ref} style={inView ? undefined : { minHeight }}>
      {children(inView)}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 具体行                                                              */
/* ------------------------------------------------------------------ */

export function DoubanRow({
  title,
  type,
  tag,
  ranked,
  feature,
  href,
  onOpen,
}: {
  title: string;
  type: 'movie' | 'tv';
  tag: string;
  ranked?: boolean;
  feature?: boolean;
  href?: string;
  onOpen: (item: DoubanItem) => void;
}) {
  return (
    <LazyRow minHeight={feature ? 420 : 260}>
      {(visible) => (
        <DoubanRowBody
          visible={visible}
          title={title}
          type={type}
          tag={tag}
          ranked={ranked}
          feature={feature}
          href={href}
          onOpen={onOpen}
        />
      )}
    </LazyRow>
  );
}

function DoubanRowBody({
  visible,
  title,
  type,
  tag,
  ranked,
  feature,
  href,
  onOpen,
}: {
  visible: boolean;
  title: string;
  type: 'movie' | 'tv';
  tag: string;
  ranked?: boolean;
  feature?: boolean;
  href?: string;
  onOpen: (item: DoubanItem) => void;
}) {
  const q = useDoubanList(type, tag, visible);
  return <ItemsRow title={title} href={href} query={q} ranked={ranked} feature={feature} featureLabel={type === 'tv' ? '剧集' : '电影'} onOpen={onOpen} />;
}

export function HotListRow({
  title,
  id,
  ranked,
  onOpen,
}: {
  title: string;
  id: string;
  ranked?: boolean;
  onOpen: (item: DoubanItem) => void;
}) {
  return (
    <LazyRow>
      {(visible) => <HotListRowBody visible={visible} title={title} id={id} ranked={ranked} onOpen={onOpen} />}
    </LazyRow>
  );
}

function HotListRowBody({
  visible,
  title,
  id,
  ranked,
  onOpen,
}: {
  visible: boolean;
  title: string;
  id: string;
  ranked?: boolean;
  onOpen: (item: DoubanItem) => void;
}) {
  const q = useHotList(id, visible);
  return <ItemsRow title={title} query={q} ranked={ranked} onOpen={onOpen} />;
}

export function BangumiTodayRow({ onOpen }: { onOpen: (item: DoubanItem) => void }) {
  return <LazyRow>{(visible) => <BangumiBody visible={visible} onOpen={onOpen} />}</LazyRow>;
}

function BangumiBody({ visible, onOpen }: { visible: boolean; onOpen: (item: DoubanItem) => void }) {
  const q = useQuery({
    queryKey: ['bangumi-calendar'],
    queryFn: ({ signal }) => api.bangumiCalendar(signal),
    enabled: visible,
    staleTime: 30 * 60_000,
  });
  const today = ((new Date().getDay() + 6) % 7) + 1;
  const items = q.data?.days.find((d) => d.weekday === today)?.items;
  return (
    <ItemsRow
      title="今日新番放送"
      query={{ data: items, isLoading: q.isLoading || (!q.data && !q.isError), isError: q.isError }}
      onOpen={onOpen}
    />
  );
}

function ItemsRow({
  title,
  href,
  query,
  ranked,
  feature,
  featureLabel = '',
  onOpen,
}: {
  title: string;
  href?: string;
  query: { data?: DoubanItem[]; isLoading: boolean; isError: boolean };
  ranked?: boolean;
  feature?: boolean;
  featureLabel?: string;
  onOpen: (item: DoubanItem) => void;
}) {
  if (query.isError) return null;
  if (!query.isLoading && (!query.data || query.data.length === 0)) return null;
  return (
    <Row title={title} href={href}>
      {query.isLoading || !query.data ? (
        <RowSkeleton feature={feature} />
      ) : feature ? (
        query.data.map((item) => <FeatureCard key={item.id} item={item} label={featureLabel} onOpen={onOpen} />)
      ) : (
        query.data.map((item, i) => (
          <PosterCard key={item.id} item={item} rank={ranked ? i + 1 : undefined} onOpen={onOpen} className={POSTER_W} />
        ))
      )}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* 分类浏览                                                            */
/* ------------------------------------------------------------------ */

const CATEGORIES: { label: string; sub: string; type: 'movie' | 'tv'; tag: string; bg: string }[] = [
  { label: '华语电影', sub: 'Chinese', type: 'movie', tag: '华语', bg: 'from-[#7a1f1f] via-[#b23a2a] to-[#e0803a]' },
  { label: '欧美大片', sub: 'Hollywood', type: 'movie', tag: '欧美', bg: 'from-[#0f2a5c] via-[#1f4fa3] to-[#4f8de0]' },
  { label: '动画', sub: 'Animation', type: 'movie', tag: '动画', bg: 'from-[#1d6b3a] via-[#33a35a] to-[#a3d65c]' },
  { label: '经典', sub: 'Classics', type: 'movie', tag: '经典', bg: 'from-[#3b2a14] via-[#7a5a2a] to-[#c9a35c]' },
  { label: '美剧', sub: 'US Series', type: 'tv', tag: '美剧', bg: 'from-[#2a1458] via-[#5b2ea8] to-[#a26bf0]' },
  { label: '韩剧', sub: 'K-Drama', type: 'tv', tag: '韩剧', bg: 'from-[#6b1446] via-[#b0306f] to-[#f07aa8]' },
  { label: '日剧', sub: 'J-Drama', type: 'tv', tag: '日剧', bg: 'from-[#5c0f1a] via-[#a3283a] to-[#e86a6a]' },
  { label: '国产剧', sub: 'C-Drama', type: 'tv', tag: '国产剧', bg: 'from-[#5c3a0f] via-[#b0701f] to-[#f0b44f]' },
  { label: '日本动画', sub: 'Anime', type: 'tv', tag: '日本动画', bg: 'from-[#0f4a5c] via-[#1f8aa3] to-[#5cd6e0]' },
  { label: '综艺', sub: 'Variety', type: 'tv', tag: '综艺', bg: 'from-[#5c0f4a] via-[#a31f8a] to-[#e05cc9]' },
  { label: '纪录片', sub: 'Documentary', type: 'tv', tag: '纪录片', bg: 'from-[#1a2a1a] via-[#3a5a3a] to-[#7a9a6a]' },
  { label: '冷门佳片', sub: 'Hidden Gems', type: 'movie', tag: '冷门佳片', bg: 'from-[#1a1a2e] via-[#3a3a6e] to-[#7a7ad6]' },
];

export function CategoryRow() {
  return (
    <Row title="按分类浏览">
      {CATEGORIES.map((c) => (
        <Link
          key={c.label}
          href={`/?browse=${c.type}&tag=${encodeURIComponent(c.tag)}`}
          className="group/card shrink-0 snap-start w-[46%] sm:w-[31%] md:w-[24%] lg:w-[19%] xl:w-[16%] focus-visible:outline-none"
        >
          <div
            className={cn(
              'poster-lift relative aspect-[16/10] rounded-xl overflow-hidden bg-gradient-to-br ring-1 ring-white/5 group-focus-visible/card:ring-[3px] group-focus-visible/card:ring-content',
              c.bg
            )}
          >
            <div className="absolute -right-6 -top-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <span className="absolute right-3 top-2 text-[11px] font-semibold uppercase tracking-widest text-white/50">
              {c.sub}
            </span>
            <span className="absolute left-3 bottom-2.5 text-white text-[17px] font-bold [text-shadow:0_1px_8px_rgba(0,0,0,.35)]">
              {c.label}
            </span>
            <div className="poster-sheen absolute inset-0" />
          </div>
        </Link>
      ))}
    </Row>
  );
}
