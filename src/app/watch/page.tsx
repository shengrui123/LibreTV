'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/client-api';
// 播放器（artplayer + hls.js）按需加载：拆出独立 chunk，不占首屏 First Load JS
const PlayerShell = dynamic(() => import('@/components/player-shell').then((m) => m.PlayerShell), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  ),
});
import { EmptyState, LoadingState, Spinner } from '@/components/states';
import { SwitchSourceModal } from '@/components/switch-source';
import { SkipMarkPanel } from '@/components/skip-mark-panel';
import { skipMarkKey, validateSegment, type SkipSegment } from '@/lib/skip-marks';
import type { PlayerSkipApi } from '@/components/player-shell';
import { useToast } from '@/components/toast';
import { enqueueDownload } from '@/components/download-manager';
import { Icon } from '@/components/icon';
import { useAuth } from '@/components/auth';
import { resolveSource, useAppStore, isSourceDisabled, isInDisabledSubscription, readQuality } from '@/lib/store';
import type { SourceConfig } from '@/lib/types';
import { qualityKey } from '@/lib/quality';
import {
  clearProgress,
  progressKeyOf,
  saveProgress,
  updateHistoryProgress,
  addSearchHistory,
  upsertHistory,
  db,
} from '@/lib/db';
import { buildWatchUrl, cn, validateSourceUrl } from '@/lib/utils';

/**
 * 播放页（唯一入口，替代旧版 watch.html → player.html 跳转链）。
 * 状态全部由 URL 驱动：/watch?source=xx&id=..&index=..&title=..
 * 集数列表由服务端详情接口获取；进度与历史走 IndexedDB。
 */
export default function WatchPage() {
  return (
    <Suspense>
      <WatchEntry />
    </Suspense>
  );
}

function WatchEntry() {
  const params = useSearchParams();
  return params.get('auto') === '1' ? <AutoResolve /> : <WatchContent />;
}

function AutoResolve() {
  const params = useSearchParams();
  const router = useRouter();
  const { verified } = useAuth();
  const selectedKeys = useAppStore((state) => state.selectedKeys);
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated());
  useEffect(() => {
    const unsubscribe = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAppStore.persist.hasHydrated()) setHydrated(true);
    return unsubscribe;
  }, []);
  const title = params.get('title') || '';
  const episodeName = params.get('episodeName') || '';
  const episodeNumber = Number(params.get('episodeNumber')) || 0;
  const index = Math.max(0, parseInt(params.get('index') || '0', 10) || 0);
  const sourceKey = params.get('source') || '';
  const vodId = params.get('id') || '';
  const sourceUrl = params.get('sourceUrl') || '';
  const detailUrl = params.get('detail') || '';
  const normalize = (value: string) => value.normalize('NFKC').replace(/\s+/g, '').toLocaleLowerCase().replace(/第([一二三四五六七八九十]+)季/g, (_, n: string) => { const d: Record<string, number> = {一:1,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9}; const p=n.split('十'); return `第${p.length===2?(d[p[0]]||1)*10+(d[p[1]]||0):d[n]}季`; });
  const query = useQuery({
    queryKey: ['auto-play', title, episodeName, episodeNumber, index, sourceKey, vodId, sourceUrl, detailUrl, selectedKeys],
    enabled: !!verified && hydrated,
    retry: false, staleTime: 0,
    queryFn: async ({ signal }) => {
      if (!title) throw new Error('缺少影片名称');
      const state = useAppStore.getState();
      const sources = [...new Set(state.selectedKeys)].map((key) => resolveSource(state, key)).filter((source): source is SourceConfig => !!source && validateSourceUrl(source.url) && !isSourceDisabled(state, source.key) && !isInDisabledSubscription(state, source.key));
      const hinted = sourceKey && vodId ? resolveSource(state, sourceKey, { url: sourceUrl || undefined, detail: detailUrl || undefined }) : undefined;
      if (hinted && validateSourceUrl(hinted.url) && !isSourceDisabled(state, hinted.key) && !isInDisabledSubscription(state, hinted.key) && !sources.some((source) => source.key === hinted.key)) sources.push(hinted);
      if (!sources.length) throw new Error('请先在设置中添加并启用点播源');
      const result = await api.search(title, sources, state.yellowFilter, { signal }).catch((error) => { if (signal.aborted || !hinted) throw error; return { list: [] }; });
      const candidates: { source: SourceConfig; id: string }[] = result.list.filter((item) => normalize(item.name) === normalize(title) || (/第1季$/.test(normalize(title)) && normalize(item.name) === normalize(title).replace(/第1季$/, ''))).flatMap((item) => { const source = sources.find((entry) => entry.key === item.sourceKey); return source ? [{ source, id: item.vodId }] : []; });
      if (hinted && vodId && sources.some((source) => source.key === hinted.key)) candidates.push({ source: hinted, id: vodId });
      const unique = candidates.filter((candidate, i) => candidates.findIndex((other) => other.source.key === candidate.source.key && other.id === candidate.id) === i);
      const probes = await Promise.all(unique.map(async (candidate) => {
        const probe = await api.detailSpeed(candidate.id, candidate.source, signal);
        if (!probe.ok || !probe.detail) return null;
        const numberedIndex = episodeNumber ? probe.detail.episodeNames?.findIndex((name) => new RegExp(`^第0*${episodeNumber}[集期](?:上|$)`).test(name.trim())) ?? -1 : -1;
        const namedIndex = episodeNumber ? numberedIndex : episodeName ? probe.detail.episodeNames?.findIndex((name) => normalize(name) === normalize(episodeName)) ?? -1 : index;
        return namedIndex >= 0 && probe.detail.episodes[namedIndex] ? { ...candidate, index: namedIndex, ms: probe.ms } : null;
      }));
      const available = probes.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      if (!available.length) throw new Error('没有找到这一集的播放资源');
      const heights = new Map<string, number>();
      for (const entry of available) { const height = readQuality(entry.source.key, entry.id)?.height; if (height) heights.set(`${entry.source.key}:${entry.id}`, height); }
      const missing = available.filter((entry) => !heights.has(`${entry.source.key}:${entry.id}`));
      try {
        for (let i = 0; i < missing.length; i += 50) {
          await api.qualityProbeStream(missing.slice(i, i + 50).map((entry) => ({ source: entry.source, id: entry.id })), (result) => { if (result.height) heights.set(`${result.sourceKey}:${result.vodId}`, result.height); }, signal);
        }
      } catch (error) { if (signal.aborted) throw error; }
      const best = available.sort((a, b) => (heights.get(`${b.source.key}:${b.id}`) ?? 0) - (heights.get(`${a.source.key}:${a.id}`) ?? 0) || a.ms - b.ms)[0];
      return buildWatchUrl({ sourceKey: best.source.key, vodId: best.id, index: best.index, title, sourceUrl: best.source.url, detail: best.source.detail });
    },
  });
  useEffect(() => {
    if (!query.data) return;
    void addSearchHistory(title).catch(() => {});
    router.replace(query.data);
  }, [query.data, router, title]);
  return <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6"><button className="btn-icon-glass absolute left-4 top-4" aria-label="返回" onClick={() => { if (window.history.length > 1) router.back(); else router.push('/'); }}><Icon name="chevronLeft" className="w-5 h-5" /></button>{query.isError ? <><p role="alert" className="text-center">{query.error instanceof Error ? query.error.message : '查找播放资源失败'}</p><button className="btn-ghost mt-4" onClick={() => void query.refetch()}>重试</button></> : <><Spinner size="lg" /><p role="status" className="mt-4 text-white/70">正在查找播放资源…</p></>}</main>;
}

function WatchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const store = useAppStore();
  const { verified } = useAuth();
  const { toast } = useToast();

  const sourceKey = searchParams.get('source') || '';
  const vodId = searchParams.get('id') || '';
  const directUrl = searchParams.get('url') || '';
  const titleParam = searchParams.get('title') || '';
  const indexParam = parseInt(searchParams.get('index') || '0', 10) || 0;

  const [reversed, setReversed] = useState(false);
  const [episodeHost, setEpisodeHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!episodeHost) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setEpisodeHost(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [episodeHost]);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealControls = () => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setControlsVisible(false), 3500);
  };
  useEffect(() => () => { if (controlsTimer.current) clearTimeout(controlsTimer.current); }, []);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [skipPanelOpen, setSkipPanelOpen] = useState(false);
  // 播放器对外暴露的精确时间读取接口（「记录当前」用），随播放器卸载置空
  const playerApiRef = useRef<PlayerSkipApi | null>(null);
  // 播放框：小屏「跳过标记」抽屉要按它的底边算剩余高度，避免压住画面
  const playerFrameRef = useRef<HTMLDivElement | null>(null);
  const [sheetMaxHeight, setSheetMaxHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!skipPanelOpen) return;
    const measure = () => {
      // 桌面端抽屉贴右侧、整屏高，不受播放器位置影响
      if (window.matchMedia('(min-width: 1024px)').matches) {
        setSheetMaxHeight(undefined);
        return;
      }
      const box = playerFrameRef.current?.getBoundingClientRect();
      if (!box) {
        setSheetMaxHeight(undefined);
        return;
      }
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const room = viewport - box.bottom - 12;
      // 不超过视口 60%；矮窗下最多压到 160px，再小就没法用了
      setSheetMaxHeight(Math.round(Math.max(160, Math.min(viewport * 0.6, room))));
    };
    measure();
    // 只在打开与尺寸变化时测：跟着滚动实时改高度会让抽屉边滚边长，很晃
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [skipPanelOpen]);

  const source = sourceKey === 'emby' ? { key: 'emby', name: 'Emby', url: 'https://emby.invalid' } : resolveSource(store, sourceKey, {
    url: searchParams.get('sourceUrl') || undefined,
    detail: searchParams.get('detail') || undefined,
  });

  // 详情查询：无 id（纯直连链接分享）时跳过
  const detailQuery = useQuery({
    queryKey: ['detail', sourceKey, vodId, source?.url],
    queryFn: ({ signal }) => api.detail(vodId, source!, signal),
    enabled: Boolean(source && vodId && verified),
    staleTime: 5 * 60_000,
  });

  const episodes = useMemo(() => detailQuery.data?.episodes ?? [], [detailQuery.data]);
  const videoTitle = titleParam || detailQuery.data?.videoInfo?.title || '未知视频';

  // 当前播放地址：优先取剧集列表中的当前集，其次直连 URL 参数
  const currentUrl = useMemo(() => {
    if (episodes.length > 0) {
      const idx = Math.min(Math.max(indexParam, 0), episodes.length - 1);
      return episodes[idx] || directUrl;
    }
    return directUrl;
  }, [episodes, indexParam, directUrl]);

  const currentIndex = useMemo(() => {
    if (episodes.length > 0) return Math.min(Math.max(indexParam, 0), episodes.length - 1);
    return indexParam;
  }, [episodes, indexParam]);

  // 跳过片段按剧名记忆：换集不变，换源到同名资源也能命中。
  // 标题缺失（直连链接）时退回 source:vodId，至少保证本源本片可用。
  const skipMarkFallback = `${sourceKey}:${vodId || currentUrl}`;
  const markKey = useMemo(
    () => skipMarkKey(videoTitle, skipMarkFallback),
    [videoTitle, skipMarkFallback]
  );
  const skipMark = store.skipMarks[markKey];
  const markedCount = skipMark?.segments.length ?? 0;

  // 中段两步态的起点：页面层持有，面板按钮与 Shift+S/E 共用同一份状态
  const [pendingStart, setPendingStart] = useState<number | null>(null);
  // 换集清空中段两步态：起点属于上一集，不能和新集的位置拼成区间
  useEffect(() => setPendingStart(null), [sourceKey, vodId, currentIndex]);

  const goEpisode = useCallback(
    (index: number) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set('index', String(index));
      sp.set('url', episodes[index] || directUrl);
      sp.delete('position');
      router.replace(`/watch?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams, episodes, directUrl]
  );

  // 进度恢复优先级：URL position 参数 > IndexedDB 记录
  const getRestorePosition = useCallback(async () => {
    const urlPos = parseInt(searchParams.get('position') || '0', 10) || 0;
    if (urlPos > 0) return urlPos;
    if (!vodId) return 0;
    const entry = await db.progress.get(progressKeyOf(sourceKey, vodId, currentIndex));
    return entry?.position ?? 0;
  }, [searchParams, sourceKey, vodId, currentIndex]);

  // 写入观看历史（进入页面即记录，进度后续增量更新）
  useEffect(() => {
    if (!verified || !sourceKey || !currentUrl) return;
    const timer = setTimeout(() => {
      upsertHistory({
        sourceKey,
        sourceUrl: source?.url,
        vodId: vodId || currentUrl,
        title: videoTitle,
        pic: detailQuery.data?.videoInfo?.cover,
        episodeIndex: currentIndex,
        totalEpisodes: episodes.length,
        playbackPosition: 0,
        duration: 0,
        timestamp: Date.now(),
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verified, sourceKey, vodId, currentIndex, videoTitle, currentUrl]);

  // 播放中与暂停时的进度落盘逻辑一致，共用同一回调
  const handleProgress = useCallback(
    (position: number, duration: number) => {
      if (vodId) {
        saveProgress(sourceKey, vodId, currentIndex, position, duration).catch(() => {});
        updateHistoryProgress(sourceKey, vodId || currentUrl, position, duration).catch(() => {});
      }
    },
    [sourceKey, vodId, currentIndex, currentUrl]
  );

  // 自动连播的 800ms 延迟切集要在卸载时取消，避免离开页面后跳转
  const autoNextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (autoNextTimer.current) clearTimeout(autoNextTimer.current);
  }, []);

  const handleEnded = useCallback(() => {
    if (vodId) clearProgress(sourceKey, vodId, currentIndex).catch(() => {});
    if (store.autoplayNext && currentIndex < episodes.length - 1) {
      autoNextTimer.current = setTimeout(() => goEpisode(currentIndex + 1), 800);
    }
  }, [store.autoplayNext, currentIndex, episodes.length, goEpisode, sourceKey, vodId]);

  // 快捷键（Shift+I/O/S/E）记录片段：校验后写入
  const handleRecordSegment = useCallback(
    (segment: SkipSegment) => {
      const duration = playerApiRef.current?.getDuration() ?? 0;
      const existing = useAppStore.getState().skipMarks[markKey]?.segments ?? [];
      const error = validateSegment(segment, duration, existing);
      if (error) {
        toast(error, 'error');
        return;
      }
      useAppStore.getState().setSkipMark(markKey, [...existing, segment]);
      const label =
        segment.type === 'opening' ? '片头结束' : segment.type === 'ending' ? '片尾开始' : '中段片段';
      // 中段命中时的表现取决于全局「自动跳过片段」，记完就说清楚，避免"标了却没反应"
      const hint =
        segment.type === 'middle'
          ? useAppStore.getState().autoSkipSegments
            ? '，命中时将自动跳过'
            : '，命中时显示跳过按钮'
          : '';
      toast(`已记录${label}${hint}`, 'success');
    },
    [markKey, toast]
  );

  // Alt+←/→ 集数切换快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey) return;
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        goEpisode(currentIndex - 1);
      } else if (e.key === 'ArrowRight' && currentIndex < episodes.length - 1) {
        e.preventDefault();
        goEpisode(currentIndex + 1);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [currentIndex, episodes.length, goEpisode]);

  const orderedEpisodes = reversed ? [...episodes].map((_, i) => episodes.length - 1 - i) : episodes.map((_, i) => i);

  if (!verified) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-faint text-sm">等待访问验证...</p>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-content font-medium mb-2">点播源不存在</h1>
          <p className="text-sm text-muted mb-4">
            该视频来自点播源「{sourceKey}」，但它可能已被删除。请在设置中重新添加后重试。
          </p>
          <Link href="/" className="btn-primary">返回首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen flex flex-col text-content bg-black">
      <header className="absolute inset-x-0 top-0 z-40 bg-gradient-to-b from-black/70 to-transparent">
        <div className="mx-auto px-4 sm:px-6 h-16 flex items-center gap-1.5 sm:gap-3">
          <BackButton />
          <HomeButton />
          <div className="min-w-0">
            <h1 className="text-sm font-medium text-content truncate">{videoTitle}</h1>
            <p className="text-xs text-faint">
              {source.name}
              {episodes.length > 0 && ` · 第 ${currentIndex + 1}/${episodes.length} 集`}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              className="btn-ghost btn-sm"
              onClick={() => {
                if (!currentUrl) return;
                enqueueDownload({
                  url: currentUrl,
                  // 多集才带集数后缀；单集影片（含电影）文件名就是纯标题
                  title: `${videoTitle}${episodes.length > 1 ? ` 第${currentIndex + 1}集` : ''}`,
                  format: 'MP4',
                });
                // 「已加入下载队列」由 DownloadManager 在真正入队后提示：
                // 这里先提示的话，用户随后取消保存位置会出现「已加入→已取消」的矛盾
              }}
            >
              {/* 手机上顶栏放不下完整按钮：只留图标，aria-label 保证可访问性 */}
              <Icon name="download" className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">下载本集</span>
              <span className="sr-only sm:hidden">下载本集</span>
            </button>
            <button className="btn-ghost btn-sm" onClick={() => setSwitchOpen(true)}>
              切换资源
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full pb-12">
        <div className="grid grid-cols-1 gap-6 items-start">
          <div className="min-w-0">
            <div className="relative bg-black">
            <div ref={playerFrameRef} className="group relative h-[100svh] bg-black overflow-hidden" onPointerMove={revealControls} onPointerDown={revealControls} onPlayCapture={() => { setVideoPlaying(true); revealControls(); }} onPauseCapture={() => { setVideoPlaying(false); setControlsVisible(true); }}>
              {currentUrl ? (
                <PlayerShell
                  url={currentUrl}
                  title={videoTitle}
                  adFilter={store.adFilter}
                  autoplayNext={store.autoplayNext}
                  skipMark={skipMark}
                  autoSkipSegments={store.autoSkipSegments}
                  volumeBoost={store.volumeBoost}
                  miniProgressBar={store.miniProgressBar}
                  pendingStart={pendingStart}
                  onPendingStart={setPendingStart}
                  onOpenEpisodes={setEpisodeHost}
                  onPlayerApi={(api) => { playerApiRef.current = api; }}
                  onRecordSegment={handleRecordSegment}
                  episodeKey={`${sourceKey}:${vodId}:${currentIndex}`}
                  nextUrl={currentIndex + 1 < episodes.length ? episodes[currentIndex + 1] : undefined}
                  nextEpisodeKey={currentIndex + 1 < episodes.length ? `${sourceKey}:${vodId}:${currentIndex + 1}` : undefined}
                  getRestorePosition={getRestorePosition}
                  onTimeUpdate={handleProgress}
                  onPause={handleProgress}
                  onEnded={handleEnded}
                  hasPrevEpisode={currentIndex > 0}
                  hasNextEpisode={episodes.length > 0 && currentIndex < episodes.length - 1}
                  onPrevEpisode={() => goEpisode(currentIndex - 1)}
                  onNextEpisode={() => goEpisode(currentIndex + 1)}
                  onQuality={(height) => {
                    // 播放实测是最权威的画质来源，回写后搜索列表里该「源 + 影片」直接显示
                    if (!sourceKey || !vodId) return;
                    useAppStore.getState().setQuality({
                      [qualityKey(sourceKey, vodId)]: { height, from: 'play', timestamp: Date.now() },
                    });
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  {detailQuery.isLoading ? (
                    <Spinner size="lg" />
                  ) : (
                    <p className="text-faint text-sm">
                      {detailQuery.isError ? '视频加载失败，请尝试其他资源' : '无可用播放地址'}
                    </p>
                  )}
                </div>
              )}
              {currentUrl && <div className={cn('absolute inset-0 z-10 flex items-center justify-center gap-6 sm:gap-12 pointer-events-none transition-opacity', controlsVisible || !videoPlaying ? 'opacity-100' : 'opacity-0')} aria-hidden={videoPlaying && !controlsVisible} inert={videoPlaying && !controlsVisible}>
                <button type="button" aria-label={videoPlaying ? '暂停' : '播放'} className="pointer-events-auto glass glass-clear glass-dark rounded-full w-20 h-20 sm:w-24 sm:h-24 grid place-items-center text-white" onClick={() => { const video = playerFrameRef.current?.querySelector('video'); if (video) { if (video.paused) void video.play().catch(() => {}); else video.pause(); } }}>{videoPlaying ? <span className="flex gap-2"><span className="w-2.5 h-8 rounded-sm bg-white" /><span className="w-2.5 h-8 rounded-sm bg-white" /></span> : <Icon name="play" className="w-9 h-9" />}</button>
              </div>}
              {currentUrl && <div className={cn('absolute left-5 sm:left-8 bottom-20 z-10 pointer-events-none text-white drop-shadow-lg transition-opacity', controlsVisible || !videoPlaying ? 'opacity-100' : 'opacity-0')} aria-hidden="true"><p className="text-xs sm:text-sm text-white/75">{episodes.length > 1 ? `第 ${currentIndex + 1} 集` : source.name}</p><p className="mt-1 text-xl sm:text-3xl font-bold">{videoTitle}</p></div>}
            </div>

            </div>

            {/* 操作栏 */}
            <div className="flex flex-wrap items-center gap-2 mt-5 px-4 sm:px-6">
              <button
                className="btn-ghost btn-sm"
                disabled={currentIndex <= 0}
                onClick={() => goEpisode(currentIndex - 1)}
              >
                上一集
              </button>
              <button
                className="btn-ghost btn-sm"
                disabled={episodes.length === 0 || currentIndex >= episodes.length - 1}
                onClick={() => goEpisode(currentIndex + 1)}
              >
                下一集
              </button>
              <button
                className={cn('btn-ghost btn-sm', skipPanelOpen && 'bg-chip text-content')}
                aria-expanded={skipPanelOpen}
                aria-haspopup="dialog"
                onClick={() => setSkipPanelOpen((v) => !v)}
                title={
                  markedCount > 0
                    ? `本剧已标记 ${markedCount} 段${skipMark?.enabled === false ? '（本剧跳过已关闭）' : ''}`
                    : '标记片头 / 中段 / 片尾，供本剧各集自动跳过'
                }
              >
                跳过标记{markedCount > 0 ? ` (${markedCount})` : ''}
                {markedCount > 0 && skipMark?.enabled === false && (
                  <span className="ml-1 inline-block size-1.5 rounded-full bg-faint" aria-label="本剧跳过已关闭" />
                )}
              </button>
              <label className="flex items-center gap-1.5 text-xs text-muted ml-auto cursor-pointer">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-[#2563eb]"
                  checked={store.autoplayNext}
                  onChange={(e) => store.updateSettings({ autoplayNext: e.target.checked })}
                />
                自动连播
              </label>
            </div>

            <SkipMarkPanel
              open={skipPanelOpen}
              onClose={() => setSkipPanelOpen(false)}
              markKey={markKey}
              pendingStart={pendingStart}
              onPendingStart={setPendingStart}
              mobileMaxHeight={sheetMaxHeight}
              getPlayerClock={() => {
                const api = playerApiRef.current;
                if (!api) return null;
                return {
                  currentTime: api.getCurrentTime(),
                  duration: api.getDuration(),
                  seek: (s) => api.seek(s),
                  pause: () => api.pause(),
                  isPaused: () => api.isPaused(),
                };
              }}
            />
          </div>


        </div>
      </main>

      {episodeHost && createPortal(<div className="absolute inset-0 z-[100] bg-black/30" role="dialog" aria-modal="true" aria-label="选集" onClick={() => setEpisodeHost(null)}><aside className="glass glass-thick rounded-[22px] p-5 h-fit mx-4 sm:mx-6 [--glass-tint:30_28_26] [--glass-alpha:.65] [--glass-sheen:.06]">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <h2 className="text-sm font-semibold text-content">
                剧集列表{episodes.length > 0 && `（${episodes.length}）`}
              </h2>
              {/* 排列开关紧贴它所作用的列表：放在这里才看得出它管的是这一栏的顺序 */}
              {episodes.length > 1 && (
                <button
                  className="btn-ghost btn-sm shrink-0"
                  onClick={() => setReversed((v) => !v)}
                  aria-label={reversed ? '切换为正序排列' : '切换为倒序排列'}
                  title="调整剧集列表的排列顺序"
                >
                  <Icon
                    name="arrowDown"
                    className={cn('w-3.5 h-3.5 transition-transform', reversed && 'rotate-180')}
                  />
                  {reversed ? '正序排列' : '倒序排列'}
                </button>
              )}
            </div>
            <button autoFocus type="button" className="btn-ghost btn-sm mb-3" onClick={() => setEpisodeHost(null)}>关闭选集</button>
            {episodes.length === 0 ? (
              detailQuery.isLoading ? (
                <LoadingState />
              ) : (
                <EmptyState variant="plain" title={detailQuery.isError ? '获取剧集失败' : '暂无剧集信息'} />
              )
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-4 gap-1.5 max-h-[65vh] overflow-y-auto scrollbar-thin pr-1">
                {orderedEpisodes.map((realIndex) => (
                  <EpisodeButton
                    key={realIndex}
                    index={realIndex}
                    active={realIndex === currentIndex}
                    onClick={() => { goEpisode(realIndex); setEpisodeHost(null); }}
                  />
                ))}
              </div>
            )}
            <p className="hidden md:block text-[10px] text-faint mt-3 leading-relaxed">
              快捷键：空格 播放/暂停 · ←/→ 快退/快进 5s · ↑/↓ 音量 · F 全屏 · Alt+←/→ 切换集数
            </p>
          </aside></div>, episodeHost)}

      {switchOpen && (
        <SwitchSourceModal
          currentTitle={videoTitle}
          currentSourceKey={sourceKey}
          currentVodId={vodId}
          currentIndex={currentIndex}
          onClose={() => setSwitchOpen(false)}
        />
      )}
    </div>
  );
}

/** 集数按钮：激活时自动滚动进可视区（长剧列表） */
function EpisodeButton({ index, active, onClick }: { index: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  return (
    <button
      ref={ref}
      className={cn('btn btn-sm !px-1 min-h-9', active ? 'bg-[#e7d0a5] text-[#21180e] font-semibold shadow-[0_0_20px_rgba(231,208,165,0.2)]' : 'btn-ghost')}
      onClick={onClick}
    >
      {index + 1}
    </button>
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <button
      className="glass glass-clear glass-dark grid place-items-center w-10 h-10 rounded-full text-white hover:brightness-125 transition-all"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push('/');
      }}
      aria-label="关闭播放器并返回"
    >
      <Icon name="close" className="w-5 h-5" />
    </button>
  );
}

/** 首页按钮：直达首页，避免从外链进入时逐级 back */
function HomeButton() {
  return (
    <Link
      href="/"
      className="p-2 rounded-md text-muted hover:text-content hover:bg-hover transition-colors"
      aria-label="回首页"
      title="回首页"
    >
      <Icon name="home" className="w-5 h-5" />
    </Link>
  );
}
