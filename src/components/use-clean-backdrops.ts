'use client';

import { useEffect, useState } from 'react';
import type { Worker } from 'tesseract.js';

const decisions = new Map<string, boolean>();

/** Only publish images after OCR succeeds; unchecked images never flash in the hero. */
export function useCleanBackdrops(candidates: string[]) {
  const [approved, setApproved] = useState<string[]>([]);
  const key = JSON.stringify([...new Set(candidates)].slice(0, 16));
  useEffect(() => {
    const urls = JSON.parse(key) as string[];
    let cancelled = false;
    let worker: Worker | undefined;
    const clean = urls.filter((url) => decisions.get(url) === true);
    setApproved([...clean]);
    void (async () => {
      try {
        for (const url of urls) {
          if (cancelled) break;
          if (decisions.has(url)) continue;
          if (!worker) {
            const { createWorker, PSM } = await import('tesseract.js');
            worker = await createWorker(['eng', 'chi_sim', 'chi_tra']);
            if (cancelled) break;
            await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
          }
          try {
            const response = await fetch(url.startsWith('data:') ? url : `/api/proxy?url=${encodeURIComponent(url)}`);
            if (!response.ok) continue;
            const { data } = await worker.recognize(await response.blob(), {}, { blocks: true });
            if (cancelled) break;
            const hasText = data.blocks?.some((block) => block.paragraphs.some((paragraph) => paragraph.lines.some((line) =>
              line.words.some((word) => word.confidence >= 60 && /[\p{L}\p{N}]{2,}/u.test(word.text))
            )));
            if (!data.blocks) continue;
            if (decisions.size >= 100) decisions.delete(decisions.keys().next().value!);
            decisions.set(url, !hasText);
            if (!hasText) { clean.push(url); setApproved([...clean]); }
          } catch { /* An unreadable image stays out of the carousel. */ }
        }
      } catch { /* If OCR cannot initialize, keep the neutral background. */ }
      finally { await worker?.terminate(); }
    })();
    return () => { cancelled = true; };
  }, [key]);
  // A title change must not briefly display the previous title's approved images.
  const current = new Set(candidates);
  return approved.filter((url) => current.has(url));
}
