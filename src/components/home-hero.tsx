'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { DoubanItem } from '@/lib/types';
import { Cover, useDoubanList, useHotList } from './home-rows';
import { Icon } from './icon';
import { useFocusTrap } from './use-focus-trap';

const HERO_COUNT = 8;
const HERO_INTERVAL = 8000;

function useAbstract(item: DoubanItem | null | undefined) {
  const id = item?.id ?? '';
  return useQuery({
    queryKey: ['douban-abstract', id],
    queryFn: ({ signal }) => api.doubanAbstract(id, signal),
    enabled: /^\d+$/.test(id),
    staleTime: 60 * 60_000,
    retry: false,
  });
}

function metaLine(item: DoubanItem, a?: { year?: string; region?: string; types?: string[]; duration?: string; episodes?: string }) {
  const parts: string[] = [];
  parts.push(item.isTv ? '剧集' : '电影');
  if (a?.types?.length) parts.push(a.types.slice(0, 3).join(' / '));
  if (a?.year) parts.push(a.year);
  if (a?.region) parts.push(a.region.split(/\s+/)[0]);
  if (a?.episodes) parts.push(`${a.episodes} 集`);
  else if (a?.duration) parts.push(a.duration);
  return parts.join(' · ');
}

/**
 * 首页 Hero：Apple TV 式全幅轮播。
 * 桌面端：模糊底图 + 右侧清晰海报渐隐；手机端：全幅海报 + 底部信息叠层。
 * 自动轮播（悬停暂停），支持左右滑动与指示点切换。
 */
export function HomeHero({ onPlay, onMore }: { onPlay: (item: DoubanItem) => void; onMore: (item: DoubanItem) => void }) {
  const douban = useDoubanList('movie', '热门');
  const fallback = useHotList('douban_movie_weekly', douban.isError);
  const items = (douban.data?.length ? douban.data : fallback.data ?? []).slice(0, HERO_COUNT);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const count = items.length;
  const current = items[index % Math.max(count, 1)];

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), HERO_INTERVAL);
    return () => clearTimeout(t);
  }, [index, count, paused]);

  const go = (d: number) => count && setIndex((i) => (i + d + count) % count);

  if (!current) {
    const failed = douban.isError && (fallback.isError || (!fallback.isLoading && !fallback.data?.length));
    return (
      <div className={cn('relative w-full h-[min(125vw,640px)] md:h-[min(72vh,760px)] bg-gradient-to-b from-chip to-page', !failed && 'animate-pulse')} />
    );
  }

  return (
    <section
      aria-roledescription="carousel"
      aria-label="今日热门"
      className="relative w-full h-[min(130vw,680px)] md:h-[min(78vh,820px)] min-h-[420px] overflow-hidden bg-page"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        touchX.current = null;
      }}
    >
      {items.map((item, i) => (
        <HeroSlide key={item.id} item={item} active={i === index} rank={i + 1} onPlay={onPlay} onMore={onMore} />
      ))}

      {/* 指示点 */}
      <div className="absolute z-20 bottom-5 md:bottom-10 right-4 sm:right-8 lg:right-12 flex items-center gap-1.5">
        {items.map((item, i) => (
          <button
            key={item.id}
            aria-label={`第 ${i + 1} 部：${item.title}`}
            aria-current={i === index}
            onClick={() => setIndex(i)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-500',
              i === index ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'
            )}
          />
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            aria-label="上一部"
            onClick={() => go(-1)}
            className="hidden md:grid absolute z-20 left-3 top-1/2 -translate-y-1/2 w-10 h-10 place-items-center rounded-full bg-black/30 text-white/80 hover:text-white hover:bg-black/50 backdrop-blur transition"
          >
            <Icon name="chevronLeft" />
          </button>
          <button
            aria-label="下一部"
            onClick={() => go(1)}
            className="hidden md:grid absolute z-20 right-3 top-1/2 -translate-y-1/2 w-10 h-10 place-items-center rounded-full bg-black/30 text-white/80 hover:text-white hover:bg-black/50 backdrop-blur transition"
          >
            <Icon name="chevronRight" />
          </button>
        </>
      )}
    </section>
  );
}

function HeroSlide({
  item,
  active,
  rank,
  onPlay,
  onMore,
}: {
  item: DoubanItem;
  active: boolean;
  rank: number;
  onPlay: (item: DoubanItem) => void;
  onMore: (item: DoubanItem) => void;
}) {
  const [seen, setSeen] = useState(active);
  useEffect(() => {
    if (active) setSeen(true);
  }, [active]);
  const abs = useAbstract(seen ? item : null);
  const a = abs.data;

  return (
    <div
      aria-hidden={!active}
      className={cn('absolute inset-0 transition-opacity duration-1000', active ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none')}
    >
      {seen && (
        <>
          {/* 模糊铺底（桌面） */}
          <div className="hidden md:block absolute inset-0 scale-110">
            <Cover url={item.cover} alt="" className="w-full h-full object-cover blur-3xl brightness-[.45] saturate-150" />
          </div>
          {/* 主图：手机全幅；桌面右侧并向左渐隐 */}
          <div
            className={cn(
              'absolute inset-0 md:left-auto md:w-[68%] lg:w-[62%] overflow-hidden',
              '[mask-image:linear-gradient(to_bottom,black_55%,transparent)] md:[mask-image:linear-gradient(to_right,transparent,black_38%)]'
            )}
          >
            <Cover
              url={item.cover}
              alt={item.title}
              large
              eager={rank === 1}
              className={cn(
                'w-full h-full object-cover object-[center_20%] transition-transform duration-[9000ms] ease-out',
                active ? 'scale-[1.06]' : 'scale-100'
              )}
            />
          </div>
        </>
      )}

      {/* 底部 / 左侧压暗 */}
      <div className="absolute inset-0 bg-gradient-to-t from-page via-page/30 to-transparent" />
      <div className="hidden md:block absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent" />

      {/* 信息区 */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-4 sm:px-8 lg:px-12 pb-12 md:pb-20">
        <div className={cn('max-w-xl transition-all duration-700 delay-200', active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')}>
          <div className="inline-flex items-center gap-1.5 mb-3 rounded-md bg-white/15 backdrop-blur px-2 py-1 text-[11px] font-semibold text-white">
            <span className="text-brand font-extrabold">TOP {rank}</span>
            今日热门{item.isTv ? '剧集' : '电影'}
          </div>
          <h2 className="text-white font-extrabold tracking-tight leading-[1.05] text-[34px] sm:text-5xl lg:text-6xl [text-shadow:0_4px_24px_rgba(0,0,0,.45)] line-clamp-2">
            {item.title}
          </h2>
          <p className="mt-3 text-[13px] sm:text-sm text-white/80">{metaLine(item, a)}</p>
          {a?.comment && (
            <p className="mt-2 text-[13px] sm:text-[15px] text-white/75 leading-relaxed line-clamp-2 max-w-lg">“{a.comment}”</p>
          )}
          {!a?.comment && a?.actors?.length ? (
            <p className="mt-2 text-[13px] sm:text-[15px] text-white/70 line-clamp-1">主演：{a.actors.slice(0, 4).join(' / ')}</p>
          ) : null}
          <div className="mt-3 flex items-center gap-3 text-[12px] text-white/80">
            {(a?.rate || item.rating) && (
              <span className="inline-flex items-center gap-1 rounded bg-[#00b51d]/90 px-1.5 py-0.5 font-bold text-white">
                豆瓣 {a?.rate || item.rating}
              </span>
            )}
            {a?.directors?.[0] && <span>导演 {a.directors[0]}</span>}
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button tabIndex={active ? 0 : -1} className="btn-hero !bg-white !text-black min-w-[120px]" onClick={() => onPlay(item)}>
              <Icon name="play" className="w-4 h-4" />
              播放
            </button>
            <button tabIndex={active ? 0 : -1} className="btn-glass" onClick={() => onMore(item)}>
              <Icon name="info" className="w-[18px] h-[18px]" />
              更多信息
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 预览弹窗（Netflix 风格：点海报先看简介，再决定播放）                */
/* ------------------------------------------------------------------ */

export function PreviewModal({
  item,
  onClose,
  onPlay,
}: {
  item: DoubanItem | null;
  onClose: () => void;
  onPlay: (item: DoubanItem) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(Boolean(item), panelRef);
  const abs = useAbstract(item);
  const a = abs.data;

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [item, onClose]);

  if (!item) return null;
  const isDouban = /^\d+$/.test(item.id);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 animate-fade-in" role="dialog" aria-modal aria-label={item.title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl bg-surface shadow-2xl animate-slide-up focus:outline-none"
      >
        {/* 顶部艺术区 */}
        <div className="relative h-[300px] sm:h-[380px] overflow-hidden">
          <div className="absolute inset-0 scale-125">
            <Cover url={item.cover} alt="" className="w-full h-full object-cover blur-2xl brightness-50 saturate-150" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />
          <button
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-4 top-4 z-10 w-9 h-9 grid place-items-center rounded-full bg-black/50 text-white hover:bg-black/70 backdrop-blur"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
          <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 sm:gap-6 p-5 sm:p-8">
            <div className="shrink-0 w-[110px] sm:w-[150px] aspect-[2/3] rounded-xl overflow-hidden shadow-2xl ring-1 ring-white/10">
              <Cover url={item.cover} alt={item.title} large eager className="w-full h-full object-cover" />
            </div>
            <div className="min-w-0 pb-1">
              <h2 className="text-2xl sm:text-4xl font-extrabold text-white leading-tight line-clamp-2">{item.title}</h2>
              <p className="mt-2 text-[13px] text-white/75">{metaLine(item, a)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button className="btn-hero !bg-white !text-black" onClick={() => onPlay(item)}>
                  <Icon name="play" className="w-4 h-4" />
                  搜索并播放
                </button>
                {isDouban && (
                  <a
                    className="btn-glass"
                    href={`https://movie.douban.com/subject/${item.id}/`}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    豆瓣页面
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 详情 */}
        <div className="px-5 sm:px-8 pb-8 pt-2 grid sm:grid-cols-[1fr_220px] gap-6">
          <div>
            {(a?.rate || item.rating) && (
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-extrabold text-content">{a?.rate || item.rating}</span>
                <span className="text-sm text-faint">豆瓣评分</span>
              </div>
            )}
            {a?.comment ? (
              <blockquote className="text-[15px] leading-relaxed text-muted border-l-2 border-brand pl-3">{a.comment}</blockquote>
            ) : abs.isLoading ? (
              <div className="space-y-2">
                <div className="h-3 rounded bg-chip animate-pulse" />
                <div className="h-3 w-4/5 rounded bg-chip animate-pulse" />
              </div>
            ) : (
              <p className="text-sm text-faint">点击「搜索并播放」，在已启用的点播源中查找本片。</p>
            )}
          </div>
          <dl className="text-[13px] space-y-2">
            {a?.directors?.length ? (
              <div>
                <dt className="text-faint">导演</dt>
                <dd className="text-content">{a.directors.join(' / ')}</dd>
              </div>
            ) : null}
            {a?.actors?.length ? (
              <div>
                <dt className="text-faint">主演</dt>
                <dd className="text-content">{a.actors.join(' / ')}</dd>
              </div>
            ) : null}
            {a?.region && (
              <div>
                <dt className="text-faint">地区</dt>
                <dd className="text-content">{a.region}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
