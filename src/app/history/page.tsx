'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MAX_HISTORY, removeHistory, upsertHistory, type HistoryEntry } from '@/lib/db';
import { buildWatchUrl, formatRelativeTime } from '@/lib/utils';
import { useAppStore, resolveSource } from '@/lib/store';
import { SmartImage } from '@/components/smart-image';
import { Icon } from '@/components/icon';
import { ConfirmDialog } from '@/components/confirm-dialog';

type View = 'manage' | 'timeline' | 'memories';

export default function HistoryPage() {
  const router = useRouter();
  const history = useLiveQuery(() => db.history.orderBy('timestamp').reverse().limit(MAX_HISTORY).toArray(), []);
  const [view, setView] = useState<View>('timeline');
  const [selected, setSelected] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const filtered = (history ?? []).filter((h) => h.title.toLowerCase().includes(query.trim().toLowerCase()));
    return view === 'memories' ? [...filtered].reverse() : filtered;
  }, [history, query, view]);
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  const removeSelected = async () => {
    await Promise.all((history ?? []).filter((item) => selected.includes(item.id)).map((item) => removeHistory(item.sourceKey, item.vodId)));
    setSelected([]); setConfirm(false);
  };
  return (
    <main className="min-h-[100dvh] bg-page text-content pb-36">
      <header className="flex items-center justify-between px-4 sm:px-8 lg:px-12 pt-5">
        <button className="glass glass-clear grid h-11 w-11 place-items-center rounded-full" aria-label="返回" onClick={() => window.history.length > 1 ? router.back() : router.push('/')}><Icon name="chevronLeft" className="w-5 h-5" /></button>
        <h1 className="text-lg font-semibold">观看历史</h1><span className="w-11" />
      </header>
      <div className="mx-auto max-w-6xl px-4 sm:px-8 pt-8">
        {history === undefined ? <p className="text-center text-muted mt-32">正在加载观看记录…</p> : view === 'timeline' ? <HistoryCalendar items={items} /> : history.length === 0 ? (
          <div className="min-h-[55vh] flex flex-col items-center justify-center text-center">
            <div aria-hidden className="relative h-28 w-36 mb-7"><div className="absolute left-2 top-3 h-24 w-16 -rotate-12 rounded-2xl bg-chip" /><div className="absolute right-2 top-3 h-24 w-16 rotate-12 rounded-2xl bg-chip" /><div className="glass glass-thick absolute left-10 top-0 grid h-28 w-16 place-items-center rounded-2xl"><Icon name="clock" className="w-7 h-7 text-faint" /></div></div>
            <h2 className="text-xl font-bold">观看记录还是空的</h2><p className="mt-2 text-sm text-muted">播放影片后，记录会显示在这里。</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6"><p className="text-sm text-muted">{view === 'memories' ? '回顾看过的影片' : `共 ${history.length} 条记录`}</p><input className="input w-full sm:w-64" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索观看历史" aria-label="搜索观看历史" /></div>
            {items.length === 0 ? <p className="py-20 text-center text-muted">没有匹配的观看记录</p> : <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-5">{items.map((item) => <HistoryCard key={item.id} item={item} managing={view === 'manage'} selected={selected.includes(item.id)} toggle={() => toggle(item.id)} />)}</div>}
          </>
        )}
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-5 bg-gradient-to-t from-page via-page/95 to-transparent">
        <div className="mx-auto max-w-4xl flex items-end justify-between gap-2">
          <div className="w-20">{view === 'manage' && history && history.length > 0 && <button className="btn-ghost btn-sm" onClick={() => setSelected(items.every((item) => selected.includes(item.id)) ? [] : items.map((item) => item.id))}>{items.length > 0 && items.every((item) => selected.includes(item.id)) ? '取消全选' : '全选'}</button>}</div>
          <div className="flex items-center gap-1 rounded-full glass glass-thick p-1" role="tablist" aria-label="观看历史视图">{([['manage', '管理'], ['timeline', '时间轴'], ['memories', '回忆']] as const).map(([id, label]) => <button key={id} role="tab" aria-selected={view === id} onClick={() => { setView(id); setSelected([]); }} className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${view === id ? 'bg-content text-page' : 'text-muted hover:text-content'}`}>{label}</button>)}</div>
          <div className="w-20 text-right">{view === 'manage' && <button className="btn-ghost btn-sm text-danger" disabled={!selected.length} onClick={() => setConfirm(true)}>删除 {selected.length || ''}</button>}</div>
        </div>
      </div>
      <ConfirmDialog open={confirm} danger title="删除选中的观看记录？" message={`将删除 ${selected.length} 条记录。`} confirmLabel="删除" onCancel={() => setConfirm(false)} onConfirm={() => void removeSelected()} />
    </main>
  );
}

function HistoryCard({ item, managing, selected, toggle }: { item: HistoryEntry; managing: boolean; selected: boolean; toggle: () => void }) {
  const mode = useAppStore((s) => s.imageProxyMode);
  const proxy = useAppStore((s) => s.customImageProxy);
  const source = useAppStore((s) => resolveSource(s, item.sourceKey));
  const [failed, setFailed] = useState(false);
  const href = buildWatchUrl({ sourceKey: item.sourceKey, vodId: item.vodId, index: item.episodeIndex, title: item.title, sourceUrl: source?.url || item.sourceUrl, detail: source?.detail });
  const content = <><div className="relative aspect-[2/3] rounded-2xl overflow-hidden bg-chip">{item.pic && !failed ? <SmartImage url={item.pic} mode={mode} customProxy={proxy} alt="" className="w-full h-full object-cover" onExhausted={() => setFailed(true)} /> : <div className="w-full h-full grid place-items-center"><Icon name="film" className="w-10 h-10 text-faint" /></div>}{managing && <span className={`absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full border-2 border-white ${selected ? 'bg-accent text-white' : 'bg-black/40'}`}>{selected ? '✓' : ''}</span>}{item.duration > 0 && <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40"><div className="h-full bg-white" style={{ width: `${Math.min(100, Math.max(0, item.playbackPosition / item.duration * 100))}%` }} /></div>}</div><p className="mt-2 truncate font-semibold">{item.title}</p><p className="mt-1 text-xs text-muted">{formatRelativeTime(item.timestamp)}{item.totalEpisodes > 1 ? ` · 第 ${item.episodeIndex + 1} 集` : ''}</p></>;
  return managing ? <button type="button" className="text-left min-w-0" onClick={toggle} aria-pressed={selected}>{content}</button> : <Link className="block min-w-0" href={href} onClick={() => { void upsertHistory({ ...item, timestamp: Date.now() }).catch(() => {}); }}>{content}</Link>;
}


function HistoryCalendar({ items }: { items: HistoryEntry[] }) {
  const [month, setMonth] = useState(() => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const mode = useAppStore((s) => s.imageProxyMode);
  const proxy = useAppStore((s) => s.customImageProxy);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const offset = (month.getDay() + 6) % 7;
  const byDay = useMemo(() => {
    const groups = new Map<number, HistoryEntry[]>();
    for (const item of items) {
      const date = new Date(item.timestamp);
      if (date.getFullYear() !== year || date.getMonth() !== monthIndex) continue;
      const day = date.getDate();
      groups.set(day, [...(groups.get(day) ?? []), item]);
    }
    return groups;
  }, [items, year, monthIndex]);
  const move = (delta: number) => { setMonth(new Date(year, monthIndex + delta, 1)); setSelectedDay(null); };
  const today = new Date();
  const selectedItems = selectedDay ? byDay.get(selectedDay) ?? [] : [];
  return (
    <section aria-label="观看时间轴">
      <div className="flex items-center justify-between gap-3 mb-5">
        <button type="button" className="btn-ghost w-10 h-10 !p-0" aria-label="上个月" onClick={() => move(-1)}><Icon name="chevronLeft" className="w-5 h-5" /></button>
        <h2 className="text-xl sm:text-2xl font-bold" aria-live="polite">{year} 年 {monthIndex + 1} 月</h2>
        <button type="button" className="btn-ghost w-10 h-10 !p-0" aria-label="下个月" onClick={() => move(1)}><Icon name="chevronRight" className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs sm:text-sm text-muted mb-2">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {Array.from({ length: offset }, (_, i) => <div key={`blank-${i}`} aria-hidden />)}
        {Array.from({ length: count }, (_, i) => {
          const day = i + 1;
          const dayItems = byDay.get(day) ?? [];
          const isToday = today.getFullYear() === year && today.getMonth() === monthIndex && today.getDate() === day;
          return <button type="button" key={day} onClick={() => setSelectedDay(day)} aria-label={`${monthIndex + 1}月${day}日，${dayItems.length}条记录`} aria-pressed={selectedDay === day} className={`flex flex-col items-start min-w-0 min-h-[75px] sm:min-h-[126px] rounded-xl sm:rounded-2xl p-1 sm:p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${selectedDay === day ? 'bg-content/15 ring-1 ring-content/40' : 'bg-chip/50 hover:bg-hover'}`}>
            <span className={`block text-xs sm:text-sm font-medium ${isToday ? 'text-accent' : 'text-muted'}`}>{day}</span>
            <div className="flex w-full gap-0.5 sm:gap-1 mt-1 overflow-hidden">{dayItems.slice(0, 2).map((item) => <div key={item.id} className="relative w-[45%] max-w-12 aspect-[2/3] shrink-0 overflow-hidden rounded-md bg-chip">{item.pic ? <SmartImage url={item.pic} mode={mode} customProxy={proxy} alt={item.title} className="w-full h-full object-cover" /> : <span className="grid h-full place-items-center"><Icon name="film" className="w-4 h-4 text-faint" /></span>}</div>)}{dayItems.length > 2 && <span className="self-end text-[10px] text-muted">+{dayItems.length - 2}</span>}</div>
          </button>;
        })}
      </div>
      {selectedDay !== null && <div className="mt-8"><h3 className="text-lg font-semibold mb-4">{monthIndex + 1} 月 {selectedDay} 日</h3>{selectedItems.length ? <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 sm:gap-5">{selectedItems.map((item) => <HistoryCard key={item.id} item={item} managing={false} selected={false} toggle={() => {}} />)}</div> : <p className="text-sm text-muted">这一天没有观看记录</p>}</div>}
      <p className="text-xs text-faint mt-5">按每部影片最近观看的日期显示。</p>
    </section>
  );
}
