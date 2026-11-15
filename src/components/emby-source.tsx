'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

async function request(params = '', init?: RequestInit) {
  const response = await fetch(`/api/emby${params}`, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Emby 请求失败');
  return data;
}
export function EmbySource({ title, index, onClose }: { title: string; index: number; onClose: () => void }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<{ id: string; name: string; type: string }[]>([]);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setBusy(true); setError(''); setSearched(false); setItems([]);
    void request('', { signal: controller.signal }).then(async (status) => {
      setConnected(status.connected);
      if (status.connected) {
        const data = await request(`?${new URLSearchParams({ title })}`, { signal: controller.signal });
        setItems(data.items); setSearched(true);
      }
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [expanded, title]);
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const form = event.currentTarget;
    setBusy(true); setError('');
    try {
      await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(fields)) });
      form.reset(); setConnected(true);
      const data = await request(`?${new URLSearchParams({ title })}`); setItems(data.items); setSearched(true);
    } catch (e) { setError(e instanceof Error ? e.message : '登录失败'); }
    finally { setBusy(false); }
  };
  return <section className="mb-4 rounded-2xl bg-content/5 p-4">
    <button type="button" className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>Emby <span className="text-xs text-muted">{expanded ? '收起' : '选择 Emby 服务'}</span></button>
    {expanded && <div className="mt-3 space-y-3">
      {!connected && <form onSubmit={(event) => void login(event)} className="space-y-2">
        <label className="block text-xs text-muted">服务器地址<input required name="url" type="url" placeholder="https://emby.example.com（含实际服务路径）" className="input mt-1 w-full" /></label>
        <label className="block text-xs text-muted">用户名<input required name="username" autoComplete="username" className="input mt-1 w-full" /></label>
        <label className="block text-xs text-muted">密码<input name="password" type="password" autoComplete="current-password" className="input mt-1 w-full" /></label>
        <button disabled={busy} className="btn-primary btn-sm" type="submit">登录并查找本片</button>
      </form>}
      {busy && <p role="status" className="text-xs text-muted">正在连接 Emby…</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {connected && <>
        {items.map((item) => <button type="button" key={item.id} className="block w-full rounded-xl bg-content/5 p-3 text-left text-sm hover:bg-hover" onClick={() => { onClose(); router.push(`/watch?${new URLSearchParams({ source: 'emby', id: item.id, title, index: String(index) })}`); }}>{item.name}<span className="ml-2 text-muted">{item.type} · Emby</span></button>)}
        {searched && !items.length && <p className="text-xs text-muted">Emby 中未找到本片的同名资源</p>}
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { await request('', { method: 'DELETE' }); setConnected(false); setItems([]); } catch (e) { setError(e instanceof Error ? e.message : '退出失败'); } finally { setBusy(false); } }}>断开 / 更换账号</button>
      </>}
    </div>}
  </section>;
}
