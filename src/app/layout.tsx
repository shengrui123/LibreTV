import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: 'POPMOV - 免费在线视频搜索与观看平台',
    template: '%s - POPMOV',
  },
  description:
    'POPMOV 是一个免费的在线视频搜索平台，无广告、安全，提供来自多个视频源的内容搜索与观看服务，无需注册即可使用。',
  manifest: '/manifest.webmanifest',
  // POPMOV 图标由同一张用户提供的形象导出为各端需要的尺寸。
  icons: {
    icon: [
      { url: '/brand/popmov-icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/popmov-icon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/popmov-icon-48.png', sizes: '48x48', type: 'image/png' },
      { url: '/brand/popmov-favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
      { url: '/brand/popmov-icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/brand/popmov-icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    shortcut: [{ url: '/brand/popmov-icon-32.png', type: 'image/png' }],
    apple: [{ url: '/brand/popmov-icon-180.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* 首屏前同步主题，避免亮暗闪烁 */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('libretv-theme')||'dark';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})()",
          }}
        />
      </head>
      <body>
        <div className="ambient" aria-hidden />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
