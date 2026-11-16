import { describe, expect, it, vi } from 'vitest';
import { fetchTrending, trendingEntry } from './tmdb-trending';
vi.mock('./fetch-utils', () => ({ fetchUpstream: vi.fn(), getCache: () => undefined, setCache: vi.fn() }));
describe('TMDB trending', () => {
  it('keeps movie and TV identifiers separate from Douban IDs', () => {
    const entry = trendingEntry({ id: 12, media_type: 'tv', name: '剧名', first_air_date: '2026-01-01', backdrop_path: '/abc.jpg', poster_path: '/poster.jpg', vote_average: 8.25, vote_count: 10 });
    expect(entry?.item).toMatchObject({ id: 'tmdb-tv-12', title: '剧名', isTv: true, rating: '8.3' });
    expect(entry?.abstract).toMatchObject({ year: '2026', stills: ['https://image.tmdb.org/t/p/original/abc.jpg'] });
  });
  it('excludes people and invalid image paths', () => {
    expect(trendingEntry({ id: 1, media_type: 'person', name: '演员' })).toBeNull();
    expect(trendingEntry({ id: 1, media_type: 'movie', title: '影片', backdrop_path: 'https://other.test/p.jpg' })?.abstract.stills).toEqual([]);
  });
  it('rejects arbitrary detail paths', async () => {
    await expect(fetchTrending('../../secret')).rejects.toThrow('无效');
  });
});
