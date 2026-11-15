'use client';

import { useEffect, useRef } from 'react';
import { Icon } from './icon';
import { useFocusTrap } from './use-focus-trap';

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(true, ref);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="about-title" tabIndex={-1} onClick={(event) => event.stopPropagation()} className="glass glass-thick rounded-3xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5 sm:p-7 text-content">
      <div className="flex items-center justify-between gap-4 mb-5"><h2 id="about-title" className="text-xl font-bold">关于 LibreTV</h2><button type="button" className="btn-icon-glass" onClick={onClose} aria-label="关闭关于"><Icon name="close" className="w-5 h-5" /></button></div>
      <div className="space-y-3">
        <section className="rounded-2xl bg-content/5 p-5">
          
          <p className="text-sm text-muted leading-relaxed">
            LibreTV 是一个免费的在线视频搜索与观看平台。输入片名即可在多个点播源中聚合搜索，
            无需注册、无内嵌广告、不存储任何视频文件。所有播放内容均来自第三方公开接口。
          </p>
        </section>

        <section className="rounded-2xl bg-content/5 p-5">
          <h2 className="text-base font-semibold text-content mb-2.5">快捷键</h2>
          <ul className="text-sm text-muted space-y-1.5 list-disc list-inside">
            <li><code className="text-accent">空格</code> 播放 / 暂停</li>
            <li><code className="text-accent">←</code> / <code className="text-accent">→</code> 快退 / 快进 5 秒</li>
            <li><code className="text-accent">↑</code> / <code className="text-accent">↓</code> 音量调节</li>
            <li><code className="text-accent">F</code> 切换全屏</li>
            <li><code className="text-accent">Alt + ←/→</code> 上一集 / 下一集</li>
            <li>移动端长按视频可 3 倍速播放</li>
          </ul>
        </section>

        <section className="rounded-2xl bg-content/5 p-5">
          <h2 className="text-base font-semibold text-content mb-2.5">隐私与数据</h2>
          <p className="text-sm text-muted leading-relaxed">
            你的搜索历史、观看进度等数据仅保存在本设备浏览器中（IndexedDB），不会上传到服务器。
            聚合搜索请求由服务端代理转发，第三方数据源不会看到你的 IP 地址。
          </p>
        </section>

        <section className="rounded-2xl bg-content/5 p-5">
          <h2 className="text-base font-semibold text-content mb-2.5">数据来源</h2>
          <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_square_2-d537fb228cf3ded904ef09b136fe3fec72548ebc1fea3fbbd1ad9e36364db38b.svg" alt="TMDB" className="w-16 h-16 object-contain mb-2" />
          </a>
          <p className="text-sm text-muted">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        </section>

        <section className="rounded-2xl bg-content/5 p-5">
          <h2 className="text-base font-semibold text-content mb-2.5">免责声明</h2>
          <p className="text-sm text-faint leading-relaxed">
            本项目不存储、不制作任何视频内容，仅提供第三方公开接口的聚合与播放能力。
            请尊重版权，所有内容的合法性由对应数据源负责。
          </p>
        </section>
      </div>
    </div>
  </div>;
}
