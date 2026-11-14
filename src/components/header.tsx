'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ThemeToggle } from './theme';
import { requestShowDownloadManager } from './download-manager';
import { Icon, type IconName } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { cn } from '@/lib/utils';

const SourceManagerDrawer = dynamic(() => import('./source-manager').then((mod) => mod.SourceManagerDrawer));
const HistoryPanel = dynamic(() => import('./history-panel').then((mod) => mod.HistoryPanel));

type NavKey = 'home' | 'movie' | 'tv' | 'live' | 'about' | 'search';

/**
 * 顶部导航（液态玻璃）：
 * - 悬浮的玻璃圆钮 + 玻璃胶囊导航，没有整条底色，内容从下方透出；
 * - 左侧按钮打开玻璃侧边栏（iPad 样式），宽屏额外显示居中胶囊导航；
 * - 手机端底部是悬浮的玻璃 Tab 栏。
 */
export function Header(props: { showSearch?: boolean; transparent?: boolean }) {
  return (
    <Suspense fallback={<div className={props.transparent ? 'h-0' : 'h-16'} />}>
      <HeaderInner {...props} />
    </Suspense>
  );
}

function HeaderInner({ showSearch = false, transparent = false }: { showSearch?: boolean; transparent?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // 首次打开时加载面板；之后保留挂载，让关闭过渡和面板状态正常工作。
  useEffect(() => { if (settingsOpen) setSettingsLoaded(true); }, [settingsOpen]);
  useEffect(() => { if (historyOpen) setHistoryLoaded(true); }, [historyOpen]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(showSearch);
  const [scrolled, setScrolled] = useState(false);
  const [overHero, setOverHero] = useState(transparent);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const searchHistory = useSearchHistory(query);

  const browse = searchParams.get('browse');
  const inSearch = pathname === '/' && (searchParams.has('s') || searchParams.get('search') === '1');
  const active: NavKey =
    pathname === '/live'
      ? 'live'
      : pathname === '/about'
        ? 'about'
        : inSearch
          ? 'search'
          : browse === 'movie'
            ? 'movie'
            : browse === 'tv'
              ? 'tv'
              : 'home';

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 24);
      const hero = document.querySelector<HTMLElement>('[data-hero]');
      // Hero 尚未渲染（数据加载中）时，按「靠近顶部」处理
      setOverHero(window.scrollY < (hero ? hero.offsetHeight - 120 : 200));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.add('has-tabbar');
    return () => document.body.classList.remove('has-tabbar');
  }, []);

  useEffect(() => {
    if (searchOpen && !showSearch) inputRef.current?.focus();
  }, [searchOpen, showSearch]);

  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener('libretv:open-settings', open);
    return () => window.removeEventListener('libretv:open-settings', open);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSidebarOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen]);

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    searchHistory.record(q);
  };

  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  // 叠在 Hero 上且未滚动时：图标用白色；其余情况随主题
  const onImage = transparent && overHero;

  return (
    <>
      <header className={cn('top-0 inset-x-0 z-40 pointer-events-none', transparent ? 'fixed' : 'sticky')}>
        {/* 滚动后顶部的柔和渐隐，保证玻璃按钮下的内容不抢眼 */}
        <div
          aria-hidden
          className={cn(
            'absolute inset-x-0 top-0 h-24 transition-opacity duration-300 bg-gradient-to-b from-page/80 via-page/40 to-transparent',
            !onImage && (scrolled || !transparent) ? 'opacity-100' : 'opacity-0'
          )}
        />
        <div
          className={cn(
            'relative max-w-[1680px] mx-auto px-3 sm:px-6 lg:px-10 h-16 flex items-center gap-2 sm:gap-3',
            onImage ? 'text-white' : 'text-content'
          )}
        >
          <div className="pointer-events-auto flex items-center gap-2.5">
            <GlassCircle label="打开侧边栏" dark={onImage} onClick={() => setSidebarOpen(true)}>
              <SidebarIcon />
            </GlassCircle>
          </div>

          <div className="flex-1" />

          <div className="pointer-events-auto flex items-center gap-2">
            {/* 桌面：玻璃圆钮展开为玻璃胶囊搜索框 */}
            <form
              className="hidden sm:block"
              onSubmit={(e) => {
                e.preventDefault();
                submitSearch(query);
              }}
            >
              <div ref={searchHistory.containerRef} className="relative">
                <div
                  className={cn(
                    'glass glass-clear flex items-center h-10 rounded-full transition-[width] duration-300 overflow-hidden',
                    onImage && 'glass-dark',
                    searchOpen ? 'w-60 lg:w-72' : 'w-10'
                  )}
                >
                  <button
                    type={searchOpen ? 'submit' : 'button'}
                    className="shrink-0 w-10 h-10 grid place-items-center"
                    aria-label="搜索"
                    onClick={(e) => {
                      if (!searchOpen) {
                        e.preventDefault();
                        setSearchOpen(true);
                      }
                    }}
                  >
                    <Icon name="search" className="w-[18px] h-[18px]" />
                  </button>
                  <input
                    ref={inputRef}
                    className={cn(
                      'flex-1 min-w-0 bg-transparent text-sm placeholder:opacity-60 placeholder:text-current focus:outline-none pr-4',
                      !searchOpen && 'pointer-events-none opacity-0'
                    )}
                    aria-label="搜索影片"
                    placeholder="电影、剧集、动漫…"
                    value={query}
                    maxLength={100}
                    tabIndex={searchOpen ? 0 : -1}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      searchHistory.resetActive();
                    }}
                    onFocus={searchHistory.onFocus}
                    onBlur={() => {
                      if (!query && !showSearch) setTimeout(() => setSearchOpen(false), 150);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchOpen(showSearch);
                        inputRef.current?.blur();
                      }
                      searchHistory.onKeyDown(e, pickHistory);
                    }}
                    role="combobox"
                    aria-expanded={searchHistory.visible}
                    aria-controls="header-search-history"
                    aria-autocomplete="list"
                    aria-activedescendant={
                      searchHistory.visible && searchHistory.activeIndex >= 0
                        ? `header-search-history-${searchHistory.activeIndex}`
                        : undefined
                    }
                  />
                </div>
                {searchOpen && searchHistory.visible && (
                  <div className="absolute right-0 top-full mt-2 w-72 text-content">
                    <SearchHistoryDropdown
                      id="header-search-history"
                      matches={searchHistory.matches}
                      activeIndex={searchHistory.activeIndex}
                      onPick={pickHistory}
                      onRemove={searchHistory.remove}
                      onClearAll={searchHistory.clearAll}
                    />
                  </div>
                )}
              </div>
            </form>
            <Link href="/?search=1" aria-label="搜索" className={cn('sm:hidden glass glass-clear w-10 h-10 rounded-full grid place-items-center', onImage && 'glass-dark')}>
              <Icon name="search" className="w-[18px] h-[18px]" />
            </Link>
          </div>
        </div>
      </header>

      {/* 玻璃侧边栏 */}
      <div className={cn('fixed inset-0 z-50', !sidebarOpen && 'pointer-events-none')} aria-hidden={!sidebarOpen}>
        <div
          className={cn('absolute inset-0 bg-black/40 transition-opacity duration-300', sidebarOpen ? 'opacity-100' : 'opacity-0')}
          onClick={() => setSidebarOpen(false)}
        />
        <aside
          aria-label="侧边栏"
          className={cn(
            'glass glass-thick absolute left-3 top-3 bottom-3 w-[280px] rounded-[28px] p-3 flex flex-col text-content',
            'transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)]',
            sidebarOpen ? 'translate-x-0' : '-translate-x-[calc(100%+24px)]'
          )}
        >
          <div className="flex items-center justify-between px-2 pt-1 pb-3">
            <span className="text-xl font-extrabold tracking-tight">
              Libre<span className="text-brand">TV</span>
            </span>
            <button
              className="w-9 h-9 grid place-items-center rounded-full hover:bg-hover"
              aria-label="关闭侧边栏"
              tabIndex={sidebarOpen ? 0 : -1}
              onClick={() => setSidebarOpen(false)}
            >
              <SidebarIcon />
            </button>
          </div>
          <nav className="flex flex-col gap-0.5">
            <SideLink href="/" icon="home" active={active === 'home'} onNavigate={() => setSidebarOpen(false)} tab={sidebarOpen}>首页</SideLink>
            <SideLink href="/?search=1" icon="search" active={active === 'search'} onNavigate={() => setSidebarOpen(false)} tab={sidebarOpen}>搜索</SideLink>
            <SideLink href="/?browse=movie" icon="film" active={active === 'movie'} onNavigate={() => setSidebarOpen(false)} tab={sidebarOpen}>电影</SideLink>
            <SideLink href="/?browse=tv" icon="tv" active={active === 'tv'} onNavigate={() => setSidebarOpen(false)} tab={sidebarOpen}>剧集</SideLink>
            <SideLink href="/live" icon="bolt" active={active === 'live'} onNavigate={() => setSidebarOpen(false)} tab={sidebarOpen}>直播</SideLink>
          </nav>
          <div className="my-3 mx-2 h-px bg-line" />
          <div className="flex flex-col gap-0.5">
            <span className="px-3 pb-1 text-xs font-medium text-muted">更多</span>
            <SideAction icon="clock" tab={sidebarOpen} onClick={() => { setSidebarOpen(false); setHistoryOpen(true); }}>观看历史</SideAction>
            <SideAction icon="download" tab={sidebarOpen} onClick={() => { setSidebarOpen(false); requestShowDownloadManager(); }}>下载管理</SideAction>
            <SideAction icon="gear" tab={sidebarOpen} onClick={() => { setSidebarOpen(false); setSettingsOpen(true); }}>设置</SideAction>
            <SideLink href="/about" icon="info" active={active === 'about'} onNavigate={() => setSidebarOpen(false)} tab={sidebarOpen}>关于</SideLink>
          </div>
          <div className="mt-auto flex items-center justify-between rounded-2xl bg-chip px-3 py-2">
            <span className="text-xs text-muted">外观</span>
            <ThemeToggle />
          </div>
        </aside>
      </div>

      {/* 手机：悬浮玻璃 Tab 栏 */}
      <nav
        aria-label="底部导航"
        className="sm:hidden fixed z-40 inset-x-4 bottom-[calc(12px+env(safe-area-inset-bottom))] glass rounded-full p-1"
      >
        <div className="grid grid-cols-5 h-[56px]">
          <TabItem href="/" icon="home" active={active === 'home'}>首页</TabItem>
          <TabItem href="/?browse=movie" icon="film" active={active === 'movie'}>电影</TabItem>
          <TabItem href="/?browse=tv" icon="tv" active={active === 'tv'}>剧集</TabItem>
          <TabItem href="/live" icon="bolt" active={active === 'live'}>直播</TabItem>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium text-muted"
          >
            <Icon name="clock" className="w-[22px] h-[22px]" />
            历史
          </button>
        </div>
      </nav>

      {(settingsOpen || settingsLoaded) && <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />}
      {(historyOpen || historyLoaded) && <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />}
    </>
  );
}

function SidebarIcon() {
  return (
    <svg className="w-[19px] h-[19px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3" y="4.5" width="18" height="15" rx="3.5" />
      <path d="M9.5 4.5v15" />
    </svg>
  );
}

function GlassCircle({
  label,
  onClick,
  dark,
  children,
}: {
  label: string;
  onClick: () => void;
  /** 叠在图片上时用深色玻璃 */
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cn(
        'glass glass-clear w-10 h-10 rounded-full grid place-items-center transition-transform hover:scale-105 active:scale-95',
        dark && 'glass-dark'
      )}
    >
      {children}
    </button>
  );
}

function SideLink({
  href,
  icon,
  active,
  onNavigate,
  tab,
  children,
}: {
  href: string;
  icon: IconName;
  active: boolean;
  onNavigate: () => void;
  tab: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      tabIndex={tab ? 0 : -1}
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium transition-colors',
        active ? 'glass-pill-active text-content' : 'text-muted hover:bg-hover hover:text-content'
      )}
    >
      <Icon name={icon} className="w-5 h-5 shrink-0" />
      {children}
    </Link>
  );
}

function SideAction({ icon, onClick, tab, children }: { icon: IconName; onClick: () => void; tab: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      tabIndex={tab ? 0 : -1}
      className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-[15px] font-medium text-muted hover:bg-hover hover:text-content transition-colors text-left"
    >
      <Icon name={icon} className="w-5 h-5 shrink-0" />
      {children}
    </button>
  );
}

function TabItem({ href, icon, active, children }: { href: string; icon: IconName; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium transition-all',
        active ? 'glass-pill-active text-accent' : 'text-muted'
      )}
    >
      <Icon name={icon} className="w-[22px] h-[22px]" />
      {children}
    </Link>
  );
}
