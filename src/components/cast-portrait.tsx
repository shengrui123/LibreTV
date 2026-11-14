'use client';

import { useEffect, useState } from 'react';
import { Cover } from './home-rows';
import { useInView } from './use-in-view';

// 人物模型比较耗资源，串行处理并复用本次页面会话的结果。
const results = new Map<string, Promise<Blob>>();
let queue: Promise<unknown> = Promise.resolve();
let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, { resolve: (blob: Blob) => void; reject: () => void }>();
function runWorker(url: string): Promise<Blob> {
  if (!worker) {
    worker = new Worker(new URL('./cast-cutout.worker.ts', import.meta.url));
    worker.onmessage = (event: MessageEvent<{ id: number; blob?: Blob; error?: boolean }>) => {
      const callback = pending.get(event.data.id);
      if (!callback) return;
      pending.delete(event.data.id);
      if (event.data.blob) callback.resolve(event.data.blob);
      else callback.reject();
    };
    worker.onerror = () => {
      for (const callback of pending.values()) callback.reject();
      pending.clear();
      worker?.terminate();
      worker = undefined;
    };
  }
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, url });
  });
}
function cutout(url: string): Promise<Blob> {
  const cached = results.get(url);
  if (cached) return cached;
  const task = queue.catch(() => {}).then(() => runWorker(url));
  queue = task;
  if (results.size >= 30) results.delete(results.keys().next().value!);
  results.set(url, task);
  task.catch(() => { if (results.get(url) === task) results.delete(url); });
  return task;
}

export function CastPortrait({ url, name }: { url?: string; name: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(!!url, 300);
  const [cutoutUrl, setCutoutUrl] = useState('');
  useEffect(() => {
    if (!inView || !url) return;
    let alive = true;
    let objectUrl = '';
    void cutout(url).then((blob) => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob);
      setCutoutUrl(objectUrl);
    }).catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, inView]);
  return (
    <div ref={ref} className="w-full h-32 mb-3">
      {cutoutUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cutoutUrl} alt={name} className="w-full h-full object-contain object-bottom [filter:drop-shadow(2px_0_0_white)_drop-shadow(-2px_0_0_white)_drop-shadow(0_2px_0_white)_drop-shadow(0_-2px_0_white)]" />
      ) : <Cover url={url} alt={name} className="w-full h-full object-cover rounded-xl" />}
    </div>
  );
}
