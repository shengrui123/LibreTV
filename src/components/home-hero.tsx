'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
import { cn } from '@/lib/utils';
import type { DoubanAbstract, DoubanItem } from '@/lib/types';
import { Cover, useDoubanList, useHotList } from './home-rows';
import { Icon } from './icon';
import { useFocusTrap } from './use-focus-trap';
import { useToast } from './toast';

const HERO_COUNT = 8;
const HERO_INTERVAL = 8000;

/** 豆瓣条目摘要（含剧照 stills），供 Hero / 预览 / 分类磁贴共用 */
export function useAbstract(item: DoubanItem | null | undefined) {
  const id = item?.id ?? '';
  return useQuery({
    queryKey: ['douban-abstract', id],
    queryFn: ({ signal }) => api.doubanAbstract(id, signal),
    enabled: /^\d+$/.test(id),
    staleTime: 60 * 60_000,
    retry: false,
  });
}

function metaLine(item: DoubanItem, a?: DoubanAbstract) {
  const parts: string[] = [];
  parts.push(item.isTv || a?.episodes ? '剧集' : '电影');
  if (a?.types?.length) parts.push(a.types.slice(0, 3).join(' / '));
  if (a?.year) parts.push(a.year);
  if (a?.region) parts.push(a.region.split(/\s+/)[0]);
  if (a?.episodes) parts.push(`${a.episodes} 集`);
  else if (a?.duration) parts.push(a.duration);
  return parts.join(' · ');
}

function stars(rate?: string) {
  const v = Number(rate);
  if (!v) return '';
  const n = Math.round(v) / 2; // 10 分制 → 5 星
  return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '');
}

/**
 * 首页 Hero：全幅剧照轮播（参考 Apple TV / iPadOS 视频 App）。
 * 剧照来自豆瓣移动端相册（横版大图）；拿不到剧照时回退为模糊海报铺底 + 右侧海报。
 * 当前剧照同时作为整页的环境光背景，让下方的液态玻璃有内容可折射。
 */
export function HomeHero({ onPlay, onMore }: { onPlay: (item: DoubanItem) => void; onMore: (item: DoubanItem) => void }) {
  const douban = useDoubanList('movie', '热门');
  const fallback = useHotList('douban_movie_weekly', douban.isError);
  const candidates = (douban.data?.length ? douban.data : fallback.data ?? []).slice(0, HERO_COUNT + 4);
  // 只轮播「有高清横版剧照」的作品：先并行拉摘要（服务端缓存 6h），没有剧照的跳过
  const abstracts = useQueries({
    queries: candidates.map((item) => ({
      queryKey: ['douban-abstract', item.id],
      queryFn: ({ signal }: { signal: AbortSignal }) => api.doubanAbstract(item.id, signal),
      enabled: /^\d+$/.test(item.id),
      staleTime: 60 * 60_000,
      retry: false,
    })),
  });
  const settled = abstracts.length > 0 && abstracts.every((q) => !q.isLoading);
  const withStills = candidates.filter((_, i) => abstracts[i]?.data?.stills?.length).slice(0, HERO_COUNT);
  // 全部摘要都失败（例如豆瓣限流）时才退回海报版式，保证 Hero 不为空
  const items = withStills.length > 0 ? withStills : settled ? candidates.slice(0, HERO_COUNT) : [];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);

  const count = items.length;
  const current = items[index % Math.max(count, 1)];
  const currentAbs = useAbstract(current);
  const ambientStill = currentAbs.data?.stills?.[0];

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), HERO_INTERVAL);
    return () => clearTimeout(t);
  }, [index, count, paused]);

  const go = (d: number) => count && setIndex((i) => (i + d + count) % count);

  if (!current) {
    const failed = douban.isError && (fallback.isError || (!fallback.isLoading && !fallback.data?.length));
    return (
      <div
        className={cn(
          'relative w-full h-[min(150vw,660px)] md:h-[min(66vw,720px)] lg:h-[min(80vh,860px)] bg-gradient-to-b from-white/5 to-transparent',
          !failed && 'animate-pulse'
        )}
      />
    );
  }

  return (
    <>
      {/* 环境光：当前剧照的超大模糊版，固定在整页背后 */}
      <div aria-hidden className="fixed inset-0 -z-[1] pointer-events-none overflow-hidden">
        {(ambientStill || current.cover) && (
          <div key={ambientStill || current.cover} className="absolute inset-[-10%] animate-fade-in">
            <Cover
              url={ambientStill || current.cover}
              alt=""
              className="w-full h-full object-cover blur-[90px] saturate-[1.6] opacity-60 dark:opacity-45"
            />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-page/40 to-page/80" />
      </div>

      <section
        aria-roledescription="carousel"
        aria-label="今日热门"
        className="relative w-full h-[min(150vw,660px)] md:h-[min(66vw,720px)] lg:h-[min(80vh,860px)] min-h-[440px] overflow-hidden"
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
          <HeroSlide
            key={item.id}
            item={item}
            active={i === index}
            preload={i === (index + 1) % count}
            rank={i + 1}
            onPlay={onPlay}
            onMore={onMore}
          />
        ))}

        {/* 指示点（玻璃胶囊） */}
        <div className="absolute z-20 bottom-[40px] left-1/2 -translate-x-1/2 md:translate-x-0 md:left-auto md:bottom-[92px] md:right-8 lg:right-12 glass glass-clear rounded-full px-2.5 py-2 flex items-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.id}
              aria-label={`第 ${i + 1} 部：${item.title}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={cn(
                'h-1.5 rounded-full transition-all duration-500',
                i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/45 hover:bg-white/75'
              )}
            />
          ))}
        </div>

        {count > 1 && (
          <>
            <button
              aria-label="上一部"
              onClick={() => go(-1)}
              className="btn-icon-glass hidden md:inline-grid absolute z-20 left-4 top-1/2 -translate-y-1/2"
            >
              <Icon name="chevronLeft" />
            </button>
            <button
              aria-label="下一部"
              onClick={() => go(1)}
              className="btn-icon-glass hidden md:inline-grid absolute z-20 right-4 top-1/2 -translate-y-1/2"
            >
              <Icon name="chevronRight" />
            </button>
          </>
        )}
      </section>
    </>
  );
}

function HeroSlide({
  item,
  active,
  preload,
  rank,
  onPlay,
  onMore,
}: {
  item: DoubanItem;
  active: boolean;
  preload: boolean;
  rank: number;
  onPlay: (item: DoubanItem) => void;
  onMore: (item: DoubanItem) => void;
}) {
  const { toast } = useToast();
  const [seen, setSeen] = useState(active || preload);
  useEffect(() => {
    if (active || preload) setSeen(true);
  }, [active, preload]);
  const abs = useAbstract(seen ? item : null);
  const a = abs.data;
  const still = a?.stills?.[0];
  // 摘要请求结束仍无剧照 → 海报回退版式
  const posterMode = !still && !abs.isLoading;
  const rate = a?.rate || item.rating;

  const share = async () => {
    const url = `https://movie.douban.com/subject/${item.id}/`;
    try {
      if (navigator.share) await navigator.share({ title: item.title, url });
      else {
        await navigator.clipboard.writeText(`${item.title} ${url}`);
        toast('已复制链接', 'success');
      }
    } catch {
      /* 用户取消 */
    }
  };

  return (
    <div
      aria-hidden={!active}
      className={cn('absolute inset-0 transition-opacity duration-1000', active ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none')}
    >
      {seen && still && (
        <div className="absolute inset-0 overflow-hidden">
          <Cover
            url={still}
            alt={item.title}
            eager={rank === 1}
            className={cn(
              'w-full h-full object-cover object-center transition-transform duration-[9000ms] ease-out',
              active ? 'scale-[1.06]' : 'scale-100'
            )}
          />
        </div>
      )}
      {seen && posterMode && (
        <>
          <div className="absolute inset-0 scale-110">
            <Cover url={item.cover} alt="" className="w-full h-full object-cover blur-3xl brightness-[.5] saturate-150" />
          </div>
          <div className="absolute inset-0 md:left-auto md:w-[62%] overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)] md:[mask-image:linear-gradient(to_right,transparent,black_38%)]">
            <Cover url={item.cover} alt={item.title} large className="w-full h-full object-cover object-[center_20%]" />
          </div>
        </>
      )}

      {/* 压暗：底部融入页面、左侧保证文字可读 */}
      <div className="absolute inset-0 bg-gradient-to-t from-page via-page/25 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/15 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/45 to-transparent" />

      {/* 信息区 */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-4 sm:px-8 lg:px-12 pb-[76px] md:pb-20">
        <div
          className={cn(
            'max-w-[560px] transition-all duration-700 delay-150',
            active ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          )}
        >
          <div className="glass glass-clear inline-flex items-center gap-1.5 mb-3 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white">
            <span className="rounded bg-[#00b51d] px-1 text-[10px] font-extrabold leading-4">豆瓣</span>
            今日热门 · 第 {rank} 名
          </div>
          <h2 className="hero-title font-black tracking-tight leading-[1.05] text-[40px] sm:text-6xl lg:text-7xl line-clamp-2 pb-1">
            {item.title}
          </h2>
          <p className="mt-2 text-[13px] sm:text-sm font-medium text-white/85">{metaLine(item, a)}</p>
          {a?.intro ? (
            <p className="mt-1.5 text-[13px] sm:text-[15px] text-white/75 leading-relaxed line-clamp-2">{a.intro}</p>
          ) : a?.comment ? (
            <p className="mt-1.5 text-[13px] sm:text-[15px] text-white/75 leading-relaxed line-clamp-2">“{a.comment}”</p>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-white/75">
            {rate && (
              <span className="inline-flex items-center gap-1.5">
                <b className="text-white">豆瓣 {rate}</b>
                <span className="text-[#ffcc00] tracking-tight">{stars(rate)}</span>
              </span>
            )}
            {a?.directors?.[0] && <span>导演 {a.directors[0]}</span>}
            {a?.actors?.length ? <span className="truncate max-w-[60%]">主演 {a.actors.slice(0, 3).join(' / ')}</span> : null}
          </div>
          <div className="mt-5 flex items-center gap-2.5">
            <button
              tabIndex={active ? 0 : -1}
              className="btn px-6 py-2.5 text-[15px] font-semibold bg-white text-black hover:bg-white/90 min-w-[124px]"
              onClick={() => onMore(item)}
            >
              更多资讯
            </button>
            <button tabIndex={active ? 0 : -1} className="btn-glass min-w-[96px]" onClick={() => onPlay(item)}>
              <Icon name="play" className="w-4 h-4" />
              播放
            </button>
            <button tabIndex={active ? 0 : -1} aria-label="分享" className="btn-icon-glass" onClick={share}>
              <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3m0 0L8 7m4-4 4 4M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 预览弹窗：顶部剧照 + 玻璃面板                                        */
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
  const still = a?.stills?.[0];

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
  const rate = a?.rate || item.rating;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6 animate-fade-in" role="dialog" aria-modal aria-label={item.title}>
      <div className="absolute inset-0 bg-black/55 backdrop-blur-md" onClick={onClose} />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="glass glass-thick relative w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto no-scrollbar rounded-t-[32px] sm:rounded-[32px] animate-slide-up focus:outline-none"
      >
        {/* 剧照 */}
        <div className="relative aspect-[16/10] sm:aspect-[16/8] overflow-hidden rounded-t-[32px]">
          {still ? (
            <Cover url={still} alt={item.title} eager className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 scale-125">
              <Cover url={item.cover} alt="" className="w-full h-full object-cover blur-2xl brightness-50 saturate-150" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />
          <button onClick={onClose} aria-label="关闭" className="btn-icon-glass absolute right-4 top-4 z-10 !w-9 !h-9">
            <Icon name="close" className="w-5 h-5" />
          </button>
          <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
            <h2 className="hero-title text-3xl sm:text-5xl font-black leading-tight line-clamp-2 pb-1">{item.title}</h2>
            <p className="mt-1 text-[13px] text-white/80">{metaLine(item, a)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button className="btn px-6 py-2.5 text-[15px] font-semibold bg-white text-black hover:bg-white/90" onClick={() => onPlay(item)}>
                <Icon name="play" className="w-4 h-4" />
                搜索并播放
              </button>
              {isDouban && (
                <a className="btn-glass" href={`https://movie.douban.com/subject/${item.id}/`} target="_blank" rel="noreferrer noopener">
                  豆瓣页面
                </a>
              )}
            </div>
          </div>
        </div>

        {/* 详情 */}
        <div className="px-5 sm:px-8 pb-8 pt-5 grid sm:grid-cols-[1fr_220px] gap-6 text-content">
          <div>
            {rate && (
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-3xl font-extrabold">{rate}</span>
                <span className="text-[#ffb800] text-sm">{stars(rate)}</span>
                <span className="text-sm text-faint">豆瓣评分</span>
              </div>
            )}
            {a?.intro && <p className="text-[15px] leading-relaxed text-content/85 mb-4">{a.intro}</p>}
            {a?.comment && (
              <blockquote className="text-[14px] leading-relaxed text-muted border-l-2 border-brand pl-3">{a.comment}</blockquote>
            )}
            {!a?.intro && !a?.comment && abs.isLoading && (
              <div className="space-y-2">
                <div className="h-3 rounded bg-chip animate-pulse" />
                <div className="h-3 w-4/5 rounded bg-chip animate-pulse" />
              </div>
            )}
            {/* 更多剧照 */}
            {a?.stills && a.stills.length > 1 && (
              <div className="mt-5 flex gap-2 overflow-x-auto no-scrollbar">
                {a.stills.slice(1, 6).map((s) => (
                  <div key={s} className="shrink-0 w-40 aspect-video rounded-xl overflow-hidden ring-1 ring-white/10">
                    <Cover url={s} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>
          <dl className="text-[13px] space-y-2.5">
            {a?.directors?.length ? (
              <div>
                <dt className="text-faint">导演</dt>
                <dd>{a.directors.join(' / ')}</dd>
              </div>
            ) : null}
            {a?.actors?.length ? (
              <div>
                <dt className="text-faint">主演</dt>
                <dd>{a.actors.join(' / ')}</dd>
              </div>
            ) : null}
            {a?.region && (
              <div>
                <dt className="text-faint">地区</dt>
                <dd>{a.region}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </div>
  );
}
