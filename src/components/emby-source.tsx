'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Switch } from './settings-shared';
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
  const [serviceName, setServiceName] = useState('Emby');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<{ id: string; name: string; type: string }[]>([]);
  const [searched, setSearched] = useState(false);
  useEffect(() => {
    if (!expanded) return;
    const controller = new AbortController();
    setBusy(true); setError(''); setSearched(false); setItems([]);
    void request('', { signal: controller.signal }).then(async (status) => {
      setConnected(status.connected); setServiceName(status.name || 'Emby');
      if (status.connected) {
        const data = await request(`?${new URLSearchParams({ title })}`, { signal: controller.signal });
        setItems(data.items); setSearched(true);
      }
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [expanded, title]);
  return <section className="mb-4 rounded-2xl bg-content/5 p-4">
    <button type="button" className="flex w-full items-center justify-between text-sm font-semibold" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>Emby <span className="text-xs text-muted">{expanded ? '收起' : '选择 Emby 服务'}</span></button>
    {expanded && <div className="mt-3 space-y-3">
      {!connected && <EmbyConnectionForm onConnected={() => { setExpanded(false); window.setTimeout(() => setExpanded(true), 0); }} />}
      {busy && <p role="status" className="text-xs text-muted">正在连接 Emby…</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
      {connected && <>
        {items.map((item) => <button type="button" key={item.id} className="block w-full rounded-xl bg-content/5 p-3 text-left text-sm hover:bg-hover" onClick={() => { onClose(); router.push(`/watch?${new URLSearchParams({ source: 'emby', id: item.id, title, index: String(index) })}`); }}>{item.name}<span className="ml-2 text-muted">{item.type} · {serviceName}</span></button>)}
        {searched && !items.length && <p className="text-xs text-muted">Emby 中未找到本片的同名资源</p>}
        <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { await request('', { method: 'DELETE' }); setConnected(false); setItems([]); } catch (e) { setError(e instanceof Error ? e.message : '退出失败'); } finally { setBusy(false); } }}>断开 / 更换账号</button>
      </>}
    </div>}
  </section>;
}


function EmbyConnectionForm({ onConnected, onCancel }: { onConnected: () => void; onCancel?: () => void }) {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('8096');
  const [https, setHttps] = useState(false);
  const [path, setPath] = useState('');
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parseAddress = () => {
    try {
      const url = new URL(host.includes('://') ? host : `${https ? 'https' : 'http'}://${host}`);
      setHost(url.hostname); setHttps(url.protocol === 'https:'); setPort(url.port || (url.protocol === 'https:' ? '443' : '80')); setPath(url.pathname === '/' ? '' : url.pathname); setError('');
    } catch { setError('请先输入完整的资源库地址'); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const url = new URL(host.includes('://') ? host : `${https ? 'https' : 'http'}://${host}`);
      url.protocol = https ? 'https:' : 'http:';
      url.port = port; if (path) url.pathname = path;
      await request('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.toString(), username: fields.get('username'), password: fields.get('password'), libraryName: fields.get('libraryName'), notes: fields.get('notes') }) });
      form.reset(); onConnected();
    } catch (e) { setError(e instanceof Error ? e.message : '连接失败'); }
    finally { setBusy(false); }
  };
  const label = 'block text-sm text-muted';
  return <form onSubmit={(event) => void submit(event)} className="space-y-5">
    <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-semibold text-content">连接资源库</h3><button type="button" className="btn-ghost btn-sm" onClick={parseAddress}>智能解析地址</button></div>
    <label className={label}>资源库地址<input required value={host} onChange={(e) => setHost(e.target.value)} placeholder="media.example.com" autoCapitalize="none" spellCheck={false} className="input mt-2 w-full" /></label>
    <div className="flex items-end gap-3"><label className={`${label} flex-1`}>端口<input required type="number" min="1" max="65535" value={port} onChange={(e) => setPort(e.target.value)} className="input mt-2 w-full" /></label><label className="flex items-center gap-2 py-2 text-sm text-muted">HTTPS<Switch checked={https} onChange={(value) => { setHttps(value); if (port === '8096' || port === '8920') setPort(value ? '8920' : '8096'); }} label="使用 HTTPS" /></label></div>
    <label className={label}>账号<input required name="username" autoComplete="username" placeholder="用户名或电子邮箱" className="input mt-2 w-full" /></label>
    <label className={label}>密码（可选）<span className="relative mt-2 block"><input name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" placeholder="输入密码" className="input w-full pr-20" /><button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted" aria-label={visible ? '隐藏密码' : '显示密码'} onClick={() => setVisible(!visible)}>{visible ? '隐藏' : '显示'}</button></span></label>
    <label className={label}>资源库名称（可选）<input name="libraryName" maxLength={80} placeholder="家庭资源库" className="input mt-2 w-full" /></label>
    <label className={label}>备注（可选）<textarea name="notes" maxLength={300} placeholder="观看要求、账号规则或其他备注" rows={2} className="input mt-2 w-full resize-none" /></label>
    <details className="text-sm text-muted"><summary className="cursor-pointer">进阶设置</summary><label className="mt-3 block">服务路径<input value={path} onChange={(e) => setPath(e.target.value)} placeholder="例如 /emby" className="input mt-2 w-full" /></label></details>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex gap-2"><button type="submit" disabled={busy} className="btn-primary flex-1">{busy ? '正在连接…' : '连接'}</button>{onCancel && <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost">取消</button>}</div>
  </form>;
}

export function EmbyManager() {
  const [status, setStatus] = useState<{ connected: boolean; name?: string; url?: string; notes?: string }>();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = async () => { try { setStatus(await request()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : '加载失败'); } };
  useEffect(() => { void refresh(); }, []);
  if (adding) return <EmbyConnectionForm onConnected={() => { setAdding(false); void refresh(); }} onCancel={() => setAdding(false)} />;
  return <div className="space-y-4">
    <div className="flex items-center justify-between gap-4"><div><h3 className="font-semibold text-content">Emby 服务</h3><p className="mt-1 text-xs text-muted">仅用于播放页换源，首页和搜索不展示资源库内容</p></div><button type="button" className="btn-primary btn-sm shrink-0" onClick={() => setAdding(true)}>{status?.connected ? '更换服务' : '添加 Emby'}</button></div>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {!status && !error && <p className="text-sm text-muted">正在读取连接状态…</p>}
    {status?.connected ? <div className="rounded-2xl bg-content/5 p-4 space-y-2"><div className="flex items-center justify-between gap-3"><h4 className="font-medium">{status.name}</h4><span className="text-xs text-success">已连接</span></div><p className="text-sm text-muted break-all">{status.url}</p>{status.notes && <p className="text-sm text-muted whitespace-pre-wrap">{status.notes}</p>}<button disabled={busy} type="button" className="btn-ghost btn-sm" onClick={async () => { setBusy(true); try { await request('', { method: 'DELETE' }); await refresh(); } catch (e) { setError(e instanceof Error ? e.message : '断开失败'); } finally { setBusy(false); } }}>移除连接</button></div> : status && <div className="rounded-2xl bg-content/5 p-6 text-center text-sm text-muted">尚未添加 Emby 服务</div>}
  </div>;
}
