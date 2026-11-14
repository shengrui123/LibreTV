import { describe, expect, it } from 'vitest';
import { buildRecommendationDetailUrl, buildSourceDetailUrl } from './detail-url';

describe('detail links', () => {
  it('preserves recommendation metadata and the page to return to', () => {
    const url = new URL(buildRecommendationDetailUrl({ id: 'abc', title: '影片 & 名称', cover: 'https://images.example/a?x=1', rating: '8.2', isTv: true }, '/?browse=tv&tag=热门'), 'https://example.com');
    expect(url.pathname).toBe('/detail');
    expect(url.searchParams.get('title')).toBe('影片 & 名称');
    expect(url.searchParams.get('cover')).toBe('https://images.example/a?x=1');
    expect(url.searchParams.get('returnTo')).toBe('/?browse=tv&tag=热门');
    expect(url.searchParams.get('tv')).toBe('1');
  });
  it('preserves source identity and custom API address for playback', () => {
    const url = new URL(buildSourceDetailUrl({ sourceKey: 'custom', sourceName: '片源', vodId: '12', name: '影片', sourceUrl: 'https://example.com/api?a=1&b=2' }, '/?s=影片'), 'https://example.com');
    expect(url.searchParams.get('kind')).toBe('source');
    expect(url.searchParams.get('source')).toBe('custom');
    expect(url.searchParams.get('id')).toBe('12');
    expect(url.searchParams.get('sourceUrl')).toBe('https://example.com/api?a=1&b=2');
    expect(url.searchParams.get('returnTo')).toBe('/?s=影片');
  });
});
