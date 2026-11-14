import type { DoubanItem, SearchResultItem } from './types';

export function buildRecommendationDetailUrl(item: DoubanItem, returnTo?: string): string {
  const p = new URLSearchParams({ kind: 'recommendation', id: item.id, title: item.title });
  if (item.cover) p.set('cover', item.cover);
  if (item.rating) p.set('rating', item.rating);
  if (item.isTv) p.set('tv', '1');
  if (returnTo) p.set('returnTo', returnTo);
  return `/detail?${p}`;
}

export function buildSourceDetailUrl(item: SearchResultItem, returnTo?: string): string {
  const p = new URLSearchParams({ kind: 'source', source: item.sourceKey, id: item.vodId, title: item.name });
  if (item.sourceName) p.set('sourceName', item.sourceName);
  if (item.sourceUrl) p.set('sourceUrl', item.sourceUrl);
  if (item.pic) p.set('cover', item.pic);
  if (returnTo) p.set('returnTo', returnTo);
  return `/detail?${p}`;
}
