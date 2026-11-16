import { describe, expect, it, vi } from 'vitest';
import { enrichTmdbDetail, fetchTrending, trendingEntry } from './tmdb-trending';
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
  it('maps full metadata, credits, safe trailers and recommendations into the shared detail layout', () => {
    const media = { id: 12, title: '影片', runtime: 123, genres: [{ name: '冒险' }], production_countries: [{ iso_3166_1: 'US', name: 'United States' }], credits: { cast: [{ name: '演员', profile_path: '/actor.jpg' }], crew: [{ name: '导演', job: 'Director', profile_path: '/director.jpg' }] }, videos: { results: [{ site: 'YouTube', key: 'abcdefghijk', name: '官方预告', type: 'Trailer', official: true }, { site: 'YouTube', key: 'bad/script', name: 'invalid', type: 'Trailer' }] }, recommendations: { results: [{ id: 13, title: '推荐影片' }] } };
    const entry = enrichTmdbDetail(trendingEntry(media, 'movie')!, media, 'movie');
    expect(entry.abstract).toMatchObject({ duration: '123 分钟', types: ['冒险'], region: '美国', directors: ['导演'], actors: ['演员'] });
    expect(entry.extras?.people[0]).toMatchObject({ name: '导演', photo: 'https://image.tmdb.org/t/p/w185/director.jpg' });
    expect(entry.extras?.trailers).toHaveLength(1);
    expect(entry.extras?.trailers[0].embedUrl).toBe('https://www.youtube-nocookie.com/embed/abcdefghijk?autoplay=1');
    expect(entry.extras?.items[0].id).toBe('tmdb-movie-13');
  });
  it('rejects arbitrary detail paths', async () => {
    await expect(fetchTrending('../../secret')).rejects.toThrow('无效');
  });
});
