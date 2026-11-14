'use client';

import Link from 'next/link';
import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ThemeToggle } from './theme';
import { SourceManagerDrawer } from './source-manager';
import { HistoryPanel } from './history-panel';
import { requestShowDownloadManager } from './download-manager';
import { Icon, type IconName } from './icon';
import { SearchHistoryDropdown, useSearchHistory } from './search-history';
import { cn } from '@/lib/utils';

type NavKey = 'home' | 'movie' | 'tv' | 'live' | 'about' | 'search';

/**
 * 顶部导航（Apple TV / Netflix 风格）：
 * - 首页叠在 Hero 之上，滚动前为透明渐变，滚动后变为毛玻璃黑；
 * - 桌面端横向导航 + 可展开的搜索框；
 * - 手机端顶部只保留 Logo 与常用图标，主导航放进底部 Tab 栏。
 */
export function Header(props: { showSearch?: boolean; transparent?: boolean }) {
  return (
    <Suspense fallback={<div className={props.transparent ? 'h-0' : 'h-14 sm:h-16'} />}>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(showSearch);
  const [scrolled, setScrolled] = useState(!transparent);
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
    if (!transparent) {
      setScrolled(true);
      return;
    }
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [transparent]);

  // 手机底部 Tab 栏需要给页面留出底部空白
  useEffect(() => {
    document.body.classList.add('has-tabbar');
    return () => document.body.classList.remove('has-tabbar');
  }, []);

  useEffect(() => {
    if (searchOpen && !showSearch) inputRef.current?.focus();
  }, [searchOpen, showSearch]);

  const closeMenu = () => setMenuOpen(false);

  const submitSearch = (text: string) => {
    const q = text.trim().slice(0, 100);
    if (!q) return;
    searchHistory.close();
    closeMenu();
    router.push(`/?s=${encodeURIComponent(q)}`, { scroll: false });
    searchHistory.record(q);
  };

  const pickHistory = (text: string) => {
    setQuery(text);
    submitSearch(text);
  };

  const solid = scrolled || menuOpen;

  return (
    <>
      <header
        className={cn(
          'top-0 inset-x-0 z-40 transition-[background-color,backdrop-filter,border-color] duration-300',
          transparent ? 'fixed' : 'sticky',
          solid
            ? 'bg-page/75 backdrop-blur-2xl backdrop-saturate-150 border-b border-line/40'
            : 'bg-gradient-to-b from-black/70 via-black/30 to-transparent border-b border-transparent'
        )}
      >
        <div className="max-w-[1680px] mx-auto px-4 sm:px-8 lg:px-12 h-14 sm:h-16 flex items-center gap-3 sm:gap-6">
          <Link href="/" aria-label="LibreTV 首页" className="flex items-center gap-2 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/icon-512.png" alt="" className="w-7 h-7 rounded-[8px]" />
            <span
              className={cn(
                'text-[19px] font-extrabold tracking-tight',
                solid ? 'text-content' : 'text-white'
              )}
            >
              Libre<span className="text-brand">TV</span>
            </span>
          </Link>

          {/* 桌面主导航 */}
          <nav className="hidden md:flex items-center gap-1" aria-label="主导航">
            <NavPill href="/" active={active === 'home'} light={!solid}>首页</NavPill>
            <NavPill href="/?browse=movie" active={active === 'movie'} light={!solid}>电影</NavPill>
            <NavPill href="/?browse=tv" active={active === 'tv'} light={!solid}>剧集</NavPill>
            <NavPill href="/live" active={active === 'live'} light={!solid}>直播</NavPill>
            <NavPill href="/about" active={active === 'about'} light={!solid}>关于</NavPill>
          </nav>

          <div className="flex-1" />

          {/* 桌面搜索：图标展开为胶囊输入框 */}
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
                  'flex items-center h-9 rounded-full transition-all duration-300 overflow-hidden',
                  searchOpen
                    ? 'w-56 lg:w-72 bg-chip/90 ring-1 ring-line/60 backdrop-blur'
                    : 'w-9 hover:bg-white/10'
                )}
              >
                <button
                  type={searchOpen ? 'submit' : 'button'}
                  className={cn('shrink-0 w-9 h-9 grid place-items-center', solid ? 'text-content' : 'text-white')}
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
                    'flex-1 min-w-0 bg-transparent text-sm text-content placeholder:text-faint focus:outline-none pr-3',
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
                <div className="absolute right-0 top-full mt-2 w-72">
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

          <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
            <Link
              href="/?search=1"
              aria-label="搜索"
              className={cn('sm:hidden p-2 rounded-full transition-colors', solid ? 'text-content' : 'text-white')}
            >
              <Icon name="search" />
            </Link>
            <div className="hidden sm:flex items-center gap-0.5">
              <ThemeToggle />
              <IconButton label="观看历史" light={!solid} onClick={() => setHistoryOpen(true)}>
                <Icon name="clock" />
              </IconButton>
              <IconButton label="下载管理" light={!solid} onClick={requestShowDownloadManager}>
                <Icon name="download" />
              </IconButton>
            </div>
            <IconButton label="设置" light={!solid} onClick={() => setSettingsOpen(true)}>
              <Icon name="gear" />
            </IconButton>
            <div className="sm:hidden">
              <IconButton
                label={menuOpen ? '关闭菜单' : '更多'}
                light={!solid}
                expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                <Icon name={menuOpen ? 'close' : 'menu'} />
              </IconButton>
            </div>
          </div>
        </div>

        {menuOpen && (
          <nav aria-label="更多" className="sm:hidden border-t border-line/50 px-3 py-2 animate-fade-in">
            <div className="grid grid-cols-2 gap-1.5">
              <MenuRow href="/about" icon="info" onNavigate={closeMenu}>关于</MenuRow>
              <MenuAction
                icon="download"
                onClick={() => {
                  closeMenu();
                  requestShowDownloadManager();
                }}
              >
                下载管理
              </MenuAction>
            </div>
            <div className="mt-1.5 flex items-center justify-between rounded-xl bg-chip px-3 py-2">
              <span className="text-xs text-muted">外观主题</span>
              <ThemeToggle />
            </div>
          </nav>
        )}
      </header>

      {/* 手机底部 Tab 栏（iOS 风格） */}
      <nav
        aria-label="底部导航"
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-page/80 backdrop-blur-2xl backdrop-saturate-150 border-t border-line/50 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="grid grid-cols-5 h-[56px]">
          <TabItem href="/" icon="home" active={active === 'home'}>首页</TabItem>
          <TabItem href="/?browse=movie" icon="film" active={active === 'movie'}>电影</TabItem>
          <TabItem href="/?browse=tv" icon="tv" active={active === 'tv'}>剧集</TabItem>
          <TabItem href="/live" icon="bolt" active={active === 'live'}>直播</TabItem>
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 text-[10px] text-faint"
          >
            <Icon name="clock" className="w-6 h-6" />
            历史
          </button>
        </div>
      </nav>

      <SourceManagerDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <HistoryPanel open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </>
  );
}

function NavPill({
  href,
  active,
  light,
  children,
}: {
  href: string;
  active: boolean;
  light: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      scroll
      className={cn(
        'px-3.5 py-1.5 rounded-full text-[15px] font-medium transition-colors',
        active
          ? light
            ? 'bg-white/20 text-white'
            : 'bg-content/10 text-content'
          : light
            ? 'text-white/75 hover:text-white'
            : 'text-muted hover:text-content'
      )}
    >
      {children}
    </Link>
  );
}

function TabItem({
  href,
  icon,
  active,
  children,
}: {
  href: string;
  icon: IconName;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex flex-col items-center justify-center gap-0.5 text-[10px] transition-colors',
        active ? 'text-content' : 'text-faint'
      )}
    >
      <Icon name={icon} className="w-6 h-6" />
      {children}
    </Link>
  );
}

function IconButton({
  label,
  onClick,
  expanded,
  light,
  children,
}: {
  label: string;
  onClick: () => void;
  expanded?: boolean;
  light?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        'p-2 rounded-full transition-colors',
        light ? 'text-white/85 hover:text-white hover:bg-white/10' : 'text-muted hover:text-content hover:bg-hover'
      )}
      title={label}
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuRow({
  href,
  icon,
  onNavigate,
  children,
}: {
  href: string;
  icon: IconName;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-hover hover:text-content transition-colors"
    >
      <Icon name={icon} className="w-4 h-4 shrink-0" />
      {children}
    </Link>
  );
}

function MenuAction({ icon, onClick, children }: { icon: IconName; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm text-muted hover:bg-hover hover:text-content transition-colors text-left"
    >
      <Icon name={icon} className="w-4 h-4 shrink-0" />
      {children}
    </button>
  );
}
