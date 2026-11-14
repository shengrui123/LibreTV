import { removeBackground } from '@imgly/background-removal';

self.onmessage = async (event: MessageEvent<{ id: number; url: string }>) => {
  const { id, url } = event.data;
  try {
    const mirrors = url.includes('doubanio.com') ? [
      url.replace(/img\d+\.doubanio\.com/g, 'img.doubanio.cmliussss.net'),
      url.replace(/img\d+\.doubanio\.com/g, 'img.doubanio.cmliussss.com'),
    ] : [];
    let input: Blob | undefined;
    for (const candidate of [...mirrors, `/api/proxy?url=${encodeURIComponent(url)}`]) {
      try {
        const response = await fetch(candidate, { signal: AbortSignal.timeout(10000) });
        if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
          input = await response.blob();
          break;
        }
      } catch { /* 尝试下一张镜像 */ }
    }
    if (!input) throw new Error('图片不可用');
    const blob = await removeBackground(input, { model: 'isnet_quint8', output: { format: 'image/png' } });
    self.postMessage({ id, blob });
  } catch {
    self.postMessage({ id, error: true });
  }
};
