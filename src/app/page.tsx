'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { Header } from '@/components/header';
import { HomeHero } from '@/components/home-hero';
import { buildRecommendationDetailUrl, buildSourceDetailUrl } from '@/lib/detail-url';
import { BangumiTodayRow, CategoryRow, DoubanRow, HotListRow, MOVIE_CATEGORIES, TV_CATEGORIES, useDoubanList, Cover } from '@/components/home-rows';
import { aggregateResults, type AggregatedGroup } from '@/components/video-card';
import { useAppStore, resolveSource, isInDisabledSubscription, isSourceDisabled } from '@/lib/store';
import { api } from '@/lib/client-api';
import type { DoubanItem, SourceSearchOutcome } from '@/lib/types';
import { SearchHistoryDropdown, useSearchHistory } from '@/components/search-history';
import { formatDisableTtl, validateSourceUrl } from '@/lib/utils';
import { useToast } from '@/components/toast';
import { EmptyState } from '@/components/states';
import { Icon } from '@/components/icon';

/**
 * 首页：搜索（URL ?s= 驱动，可后退/分享）+ 豆瓣推荐。
 * 搜索状态由 React Query 管理，失败源在结果区顶部以非阻塞方式展示。
 */
/** 搜索结果分批渲染的批大小：一次挂载上千张卡片会明显掉帧 */
const RESULT_PAGE_SIZE = 60;

// 首页首屏不需要频道网格和搜索详情，将它们留到用户打开时再加载。
const DoubanView = dynamic(() => import('@/components/douban-section').then((mod) => mod.DoubanView));

export default function HomePage() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}

function HomeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();
  const urlQuery = searchParams.get('s') || '';
  // 精确订阅所需字段（对齐 live 页的做法）：搜索流式期间逐源写健康度、
  // 打开设置抽屉/历史面板等无关 store 变化，都不应触发首页整树重渲染
  const customAPIs = useAppStore((s) => s.customAPIs);
  const envSources = useAppStore((s) => s.envSources);
  const selectedKeys = useAppStore((s) => s.selectedKeys);
  const yellowFilter = useAppStore((s) => s.yellowFilter);
  const sourceHealth = useAppStore((s) => s.sourceHealth);
  const subscriptions = useAppStore((s) => s.subscriptions);
  const [input, setInput] = useState(urlQuery);
  const doubanEnabled = useAppStore((s) => s.doubanEnabled);
  /** 流式搜索中已结算的源（data 就绪前用于增量渲染） */
  const [streamedOutcomes, setStreamedOutcomes] = useState<SourceSearchOutcome[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // URL 驱动搜索：?s= 变化时回填输入框
  useEffect(() => {
    if (urlQuery) setInput(urlQuery);
  }, [urlQuery]);

  // 源名回显：失败/停用提示里显示友好名称而非裸 key
  const sourceName = (key: string) =>
    customAPIs.find((a) => a.key === key)?.name ??
    envSources.find((a) => a.key === key)?.name ??
    key;

  const selectedSources = useMemo(() => {
    // selectedKeys 可能含历史残留的重复 key：按 key 去重，避免同源重复搜索
    const seen = new Set<string>();
    return selectedKeys
      .map((key) => resolveSource({ customAPIs, envSources }, key))
      .filter((s): s is NonNullable<typeof s> => {
        if (!s || !validateSourceUrl(s.url) || seen.has(s.key)) return false;
        seen.add(s.key);
        return true;
      })
      // 自动停用期内的源不参与搜索（到期自动恢复）
      .filter((s) => !isSourceDisabled({ sourceHealth }, s.key))
      // 所属订阅被整体停用的源同样跳过（无损：各源勾选状态保留，重新启用即恢复）
      .filter((s) => !isInDisabledSubscription({ subscriptions }, s.key));
  }, [customAPIs, envSources, selectedKeys, sourceHealth, subscriptions]);
  const disabledSources = useMemo(
    () => selectedKeys.filter((key) => isSourceDisabled({ sourceHealth }, key)),
    [selectedKeys, sourceHealth]
  );
  // 来自已关闭订阅的源：勾选状态还在，但本次搜索用不到，必须明确告知
  const offSubscriptionSources = useMemo(
    () =>
      selectedKeys.filter(
        (key) => !isSourceDisabled({ sourceHealth }, key) && isInDisabledSubscription({ subscriptions }, key)
      ),
    [selectedKeys, sourceHealth, subscriptions]
  );

  const searchQuery = useQuery({
    queryKey: ['search', urlQuery, selectedKeys, yellowFilter],
    // 与 runSearch 的截断规则保持一致：顶栏搜索 / 手动构造长链接不会绕过上限
    queryFn: ({ signal }) => {
      setStreamedOutcomes([]);
      return api.search(urlQuery.slice(0, 100), selectedSources, yellowFilter, {
        signal,
        // 逐源结算即更新：结果边搜边渲染，同时滚动健康度
        onSource: (outcome) => {
          setStreamedOutcomes((prev) => [...prev, outcome]);
          for (const ev of useAppStore.getState().recordSourceHealth([outcome])) {
            toast(
              ev.permanent
                ? `「${sourceName(ev.key)}」多次失败，已停止参与搜索，可在设置中恢复`
                : `「${sourceName(ev.key)}」连续超时/失败，已停用 ${formatDisableTtl(ev.ttlMs ?? 0)}`,
              'warning'
            );
          }
        },
      });
    },
    enabled: Boolean(urlQuery) && selectedSources.length > 0,
    // 5 分钟内从播放页返回时直接使用缓存，不重新搜索（服务端另有 60s 结果缓存兜底）
    staleTime: 300_000,
  });

  // 最近搜索改为搜索框下拉（聚焦展开、按输入过滤），不再常驻首屏
  const searchHistory = useSearchHistory(input);

  const runSearch = (q: string) => {
    const query = q.trim().slice(0, 100);
    if (!query) {
      toast('请输入搜索内容', 'info');
      inputRef.current?.focus();
      return;
    }
    if (selectedSources.length === 0) {
      toast('请先在设置中添加并勾选点播源', 'warning');
      return;
    }
    router.push(`/?s=${encodeURIComponent(query)}`, { scroll: false });
    searchHistory.record(query);
  };

  const pickHistory = (text: string) => {
    setInput(text);
    searchHistory.close();
    runSearch(text);
  };

  const isSearching = Boolean(urlQuery) && searchQuery.isFetching && !searchQuery.data;
  // 聚合数据未就绪时，用已结算源的结果增量渲染（健康源不再等坏源超时）
  const streamedList = useMemo(
    () => streamedOutcomes.flatMap((o) => o.list),
    [streamedOutcomes]
  );
  const list = useMemo(
    () => searchQuery.data?.list ?? (isSearching ? streamedList : []),
    [searchQuery.data, isSearching, streamedList]
  );
  const failures =
    searchQuery.data?.failures ??
    streamedOutcomes
      .filter((o) => !o.ok)
      .map((o) => ({ sourceKey: o.sourceKey, error: o.error || '请求失败', timedOut: o.timedOut }));
  // 跨源同名聚合：同名影片合并为一张卡片，展开后可选择具体来源
  const groups = useMemo(() => aggregateResults(list), [list]);

  // 分批渲染：新一次搜索（groups 变化）时重置回首批
  const [visibleCount, setVisibleCount] = useState(RESULT_PAGE_SIZE);
  const visibleGroups = useMemo(() => groups.slice(0, visibleCount), [groups, visibleCount]);
  useEffect(() => setVisibleCount(RESULT_PAGE_SIZE), [groups]);

  const browse = searchParams.get('browse');
  const browseType = browse === 'movie' || browse === 'tv' ? browse : null;
  const browseTag = searchParams.get('tag') || '热门';
  const searchMode = Boolean(urlQuery) || searchParams.get('search') === '1' || !doubanEnabled;

  const openPreview = (item: DoubanItem) => router.push(buildRecommendationDetailUrl(item, window.location.pathname + window.location.search));
  const playItem = (item: DoubanItem) => {
    setInput(item.title);
    runSearch(item.title);
  };

  // 首页：Apple TV / Netflix 式 Hero + 横向内容行
  if (!searchMode && !browseType) {
    return (
      <div className="min-h-screen flex flex-col bg-page">
        <Header transparent />
        <h1 className="sr-only">POPMOV</h1>
        <HomeHero onPlay={playItem} onMore={openPreview} />
        <main className="relative z-10 -mt-8 md:-mt-10 flex-1 space-y-3 sm:space-y-5 pb-10">
          {customAPIs.length === 0 && envSources.length === 0 && <SetupBanner />}
          <DoubanRow title="今日热门电影" type="movie" tag="热门" ranked href="/?browse=movie" onOpen={openPreview} />
          <DoubanRow title="今日热门剧集" type="tv" tag="热门" ranked href="/?browse=tv" onOpen={openPreview} />
          <CategoryRow title="按分类浏览" categories={MOVIE_CATEGORIES} />
          <CategoryRow title="按地区浏览剧集" categories={TV_CATEGORIES} />
          <DoubanRow title="最新上映" type="movie" tag="最新" href="/?browse=movie&tag=%E6%9C%80%E6%96%B0" onOpen={openPreview} />
          <DoubanRow title="热门新剧" type="tv" tag="美剧" feature href="/?browse=tv&tag=%E7%BE%8E%E5%89%A7" onOpen={openPreview} />
          <DoubanRow title="高分动漫精选" type="tv" tag="日本动画" href="/?browse=tv&tag=%E6%97%A5%E6%9C%AC%E5%8A%A8%E7%94%BB" onOpen={openPreview} />
          <BangumiTodayRow onOpen={openPreview} />
          <DoubanRow title="豆瓣高分电影" type="movie" tag="豆瓣高分" href="/?browse=movie&tag=%E8%B1%86%E7%93%A3%E9%AB%98%E5%88%86" onOpen={openPreview} />
          <DoubanRow title="热播国产剧" type="tv" tag="国产剧" href="/?browse=tv&tag=%E5%9B%BD%E4%BA%A7%E5%89%A7" onOpen={openPreview} />
          <DoubanRow title="韩剧精选" type="tv" tag="韩剧" feature href="/?browse=tv&tag=%E9%9F%A9%E5%89%A7" onOpen={openPreview} />
          <HotListRow title="豆瓣一周口碑" id="douban_movie_weekly" ranked onOpen={openPreview} />
          <HotListRow title="国产剧周榜" id="douban_tv_chinese" ranked onOpen={openPreview} />
          <DoubanRow title="华语电影" type="movie" tag="华语" href="/?browse=movie&tag=%E5%8D%8E%E8%AF%AD" onOpen={openPreview} />
          <DoubanRow title="综艺" type="tv" tag="综艺" href="/?browse=tv&tag=%E7%BB%BC%E8%89%BA" onOpen={openPreview} />
          <DoubanRow title="冷门佳片" type="movie" tag="冷门佳片" href="/?browse=movie&tag=%E5%86%B7%E9%97%A8%E4%BD%B3%E7%89%87" onOpen={openPreview} />
          <DoubanRow title="纪录片" type="tv" tag="纪录片" href="/?browse=tv&tag=%E7%BA%AA%E5%BD%95%E7%89%87" onOpen={openPreview} />
        </main>
      </div>
    );
  }

  // 频道页：电影 / 剧集，标签筛选 + 无限滚动网格
  if (browseType && !searchMode) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 w-full max-w-[1680px] mx-auto px-4 sm:px-8 lg:px-12 pt-6 sm:pt-10 pb-10">
          <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-content mb-5">
            {browseType === 'movie' ? '电影' : '剧集'}
          </h1>
          <DoubanView key={browseType} fixedType={browseType} initialTag={browseTag} onPick={openPreview} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header searchPage />

      <main className="relative flex-1 max-w-[1680px] w-full mx-auto px-4 sm:px-8 lg:px-12 pt-6 sm:pt-10 pb-10">
        <section className="mb-6 sm:mb-8">
          <h1 className="text-[34px] sm:text-5xl font-extrabold tracking-tight text-content mb-5">搜索</h1>
          <div ref={searchHistory.containerRef} className="relative w-full max-w-3xl">
            <form
              className="w-full"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(input);
              }}
            >
              {/* 搜索输入与浮层使用同一套圆角玻璃材质。 */}
              <div className="glass glass-clear rounded-full flex items-center min-h-[56px] pl-5 pr-1.5 py-1.5 focus-within:ring-2 focus-within:ring-content/20 transition-[box-shadow] duration-200">
                <Icon name="search" className="w-5 h-5 self-center mr-2.5 text-faint shrink-0" />
                <input
                  ref={inputRef}
                  autoFocus={!urlQuery}
                  className="flex-1 min-w-0 pr-2 bg-transparent text-[16px] text-content placeholder:text-faint focus:outline-none"
                  placeholder="电影、剧集、动漫、综艺…"
                  value={input}
                  maxLength={100}
                  onChange={(e) => {
                    setInput(e.target.value);
                    searchHistory.resetActive();
                  }}
                  onFocus={searchHistory.onFocus}
                  onKeyDown={(e) => searchHistory.onKeyDown(e, pickHistory)}
                  role="combobox"
                  aria-label="搜索影片"
                  aria-expanded={searchHistory.visible}
                  aria-controls="home-search-history"
                  aria-autocomplete="list"
                  aria-activedescendant={
                    searchHistory.visible && searchHistory.activeIndex >= 0
                      ? `home-search-history-${searchHistory.activeIndex}`
                      : undefined
                  }
                />
                {input && (
                  <button
                    type="button"
                    className="shrink-0 self-center mr-1 p-1.5 rounded-full text-faint hover:text-content hover:bg-hover transition-colors"
                    onClick={() => {
                      setInput('');
                      searchHistory.resetActive();
                      inputRef.current?.focus();
                    }}
                    aria-label="清空"
                  >
                    <Icon name="close" className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="btn glass glass-clear shrink-0 self-stretch px-6 text-content font-semibold hover:brightness-110 active:scale-95"
                >
                  搜索
                </button>
              </div>
            </form>

            {/* 最近搜索浮层不占文档流。 */}
            {searchHistory.visible && (
              <SearchHistoryDropdown
                id="home-search-history"
                matches={searchHistory.matches}
                activeIndex={searchHistory.activeIndex}
                onPick={pickHistory}
                onRemove={searchHistory.remove}
                onClearAll={searchHistory.clearAll}
              />
            )}
          </div>
        </section>

        {!urlQuery && <SearchSuggestions onPick={(t) => { setInput(t); runSearch(t); }} />}

        {/* 搜索结果 */}
        {urlQuery && (
          <section aria-label="搜索结果" className="mb-10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm text-muted">
                “<span className="text-content">{urlQuery}</span>” 的搜索结果
                {isSearching ? (
                  <span className="text-faint">
                    （已就绪 {streamedOutcomes.length}/{selectedSources.length} 个源…）
                  </span>
                ) : (
                  searchQuery.data && (
                    <span className="text-faint">
                      （{groups.length} 部影片 · {list.length} 条结果{failures.length > 0 && `，${failures.length} 个源失败`}）
                    </span>
                  )
                )}
              </h2>
            </div>

            {failures.length > 0 && (
              <div className="mb-3 text-xs bg-chip rounded-xl px-3 py-2 flex flex-wrap gap-x-3 gap-y-1">
                <span className="text-faint">{isSearching ? '以下源暂时无响应：' : '部分点播源请求失败：'}</span>
                {failures.map((f) => (
                  <span key={f.sourceKey} className={f.timedOut ? 'text-warning' : 'text-faint'}>
                    {f.timedOut ? '⏱' : '✗'} {sourceName(f.sourceKey)}
                    {f.timedOut ? ' 超时' : ''}
                  </span>
                ))}
              </div>
            )}

            {disabledSources.length > 0 && (
              <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
                {disabledSources.length} 个源因连续超时/失败已暂停参与搜索（临时停用的到期自动恢复，
                长期停用的需在设置中手动恢复）：{disabledSources.map((key) => sourceName(key)).join('、')}
              </div>
            )}

            {offSubscriptionSources.length > 0 && (
              <div className="mb-3 text-xs text-faint bg-chip rounded-lg px-3 py-2">
                {offSubscriptionSources.length} 个源所属的订阅已停用，未参与本次搜索（在设置 → 数据源订阅中可重新启用）：
                {offSubscriptionSources.map((key) => sourceName(key)).join('、')}
              </div>
            )}

            {selectedSources.length === 0 ? (
              <NoSourceGuide hasSources={customAPIs.length > 0 || envSources.length > 0} />
            ) : list.length > 0 ? (
              <>
                <SearchPosterResults groups={visibleGroups} onOpen={(group) => {
                  const item = { ...group.items[0], pic: group.items[0].pic || group.pic };
                  try { sessionStorage.setItem('libretv-detail-sources', JSON.stringify(group.items)); } catch { /* 存储不可用时仍可打开详情 */ }
                  router.push(buildSourceDetailUrl(item, window.location.pathname + window.location.search));
                }} />
                {groups.length > visibleCount && (
                  <div className="flex justify-center mt-4">
                    <button
                      className="btn-ghost btn-sm"
                      onClick={() => setVisibleCount((v) => v + RESULT_PAGE_SIZE)}
                    >
                      加载更多（还有 {groups.length - visibleCount} 部）
                    </button>
                  </div>
                )}
              </>
            ) : isSearching ? (
              <ResultsSkeleton />
            ) : (
              <EmptyState
                icon="search"
                title="没有找到匹配的结果"
                description="请尝试其他关键词或更换点播源"
                className="!py-16"
              />
            )}
          </section>
        )}

      </main>

    </div>
  );
}

/** 首页玻璃横幅：尚未配置点播源时引导去设置（对应参考图中 Hero 下方的横幅） */
function SetupBanner() {
  return (
    <div className="px-4 sm:px-8 lg:px-12">
      <div className="glass flex items-center gap-3 sm:gap-4 rounded-[22px] px-3.5 py-3 sm:px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="w-10 h-10 rounded-[11px] shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-content">添加点播源，开始观看</div>
          <div className="text-[12px] text-muted truncate">POPMOV 不内置片源 · 在设置中添加 Apple CMS 采集接口即可搜索播放</div>
        </div>
        <button
          className="btn px-4 py-1.5 text-[13px] font-semibold bg-content text-page hover:opacity-90 shrink-0"
          onClick={() => window.dispatchEvent(new Event('libretv:open-settings'))}
        >
          去设置
        </button>
      </div>
    </div>
  );
}

/** 搜索页空态：热门电影 / 剧集作为「大家都在搜」 */
function SearchSuggestions({ onPick }: { onPick: (title: string) => void }) {
  const movies = useDoubanList('movie', '热门');
  const tv = useDoubanList('tv', '热门');
  const titles = [...(movies.data ?? []).slice(0, 10), ...(tv.data ?? []).slice(0, 10)];
  if (titles.length === 0) return null;
  return (
    <section aria-label="热门搜索" className="max-w-3xl">
      <h2 className="text-xl font-bold text-content mb-3">大家都在搜</h2>
      <ul className="glass rounded-[24px] px-4 sm:px-5 py-1 grid sm:grid-cols-2 gap-x-8">
        {titles.map((item, i) => (
          <li key={item.id + i}>
            <button
              type="button"
              onClick={() => onPick(item.title)}
              className="w-full flex items-center gap-3 py-3 border-b border-white/5 text-left group"
            >
              <Icon name="search" className="w-4 h-4 text-faint shrink-0" />
              <span className="flex-1 truncate text-[15px] text-accent group-hover:underline">{item.title}</span>
              {item.rating && <span className="text-xs text-faint">★ {item.rating}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function resultCategory(type?: string): string {
  if (!type) return '其他';
  if (/综艺|真人秀/.test(type)) return '综艺';
  if (/动漫|动画/.test(type)) return '动漫';
  if (/电影|影片|片/.test(type)) return '电影';
  if (/电视剧|剧集|剧|连续剧/.test(type)) return '剧集';
  return '其他';
}

function SearchPosterResults({ groups, onOpen }: { groups: AggregatedGroup[]; onOpen: (group: AggregatedGroup) => void }) {
  const sections = ['电影', '剧集', '综艺', '动漫', '其他'].map((title) => ({ title, items: groups.filter((group) => resultCategory(group.typeName) === title) })).filter((section) => section.items.length);
  return <div className="space-y-9">{sections.map((section) => <section key={section.title} aria-label={section.title}><h2 className="text-xl sm:text-2xl font-bold mb-4">{section.title}</h2><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-6">{section.items.map((group) => <button key={group.key} type="button" onClick={() => onOpen(group)} className="min-w-0 text-left group focus-visible:outline-none" aria-label={`查看 ${group.name} 详情`}><div className="aspect-[2/3] rounded-2xl overflow-hidden bg-chip group-focus-visible:ring-2 group-focus-visible:ring-accent"><Cover url={group.pic} alt={group.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" /></div><p className="mt-2 text-sm sm:text-base font-semibold text-content line-clamp-2">{group.name}</p>{group.year && <p className="mt-0.5 text-sm text-muted">{group.year}</p>}</button>)}</div></section>)}</div>;
}

function ResultsSkeleton() {
  return <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">{Array.from({ length: 6 }, (_, i) => <div key={i} className="min-w-0"><div className="aspect-[2/3] rounded-2xl bg-chip animate-pulse" /><div className="h-4 w-3/4 rounded bg-chip animate-pulse mt-3" /></div>)}</div>;
}

/** 无点播源 / 未勾选点播源时的引导（替代旧版首屏静默空白） */
function NoSourceGuide({ hasSources = false }: { hasSources?: boolean }) {
  return (
    <div className="border border-dashed border-line rounded-xl p-10 text-center max-w-lg mx-auto">
      <h3 className="text-content font-medium mb-2">{hasSources ? '尚未勾选点播源' : '先添加一个点播源'}</h3>
      <p className="text-sm text-muted leading-relaxed">
        {hasSources ? (
          <>点击右上角「设置」，勾选要参与搜索的点播源后重新搜索。</>
        ) : (
          <>
            POPMOV 不内置任何采集站。点击右上角「设置 → 添加 API」，填入一个
            Apple CMS 采集站地址（如 <code className="text-accent text-xs">https://example.com/api.php/provide/vod</code>），
            勾选后即可开始搜索。
          </>
        )}
      </p>
    </div>
  );
}
