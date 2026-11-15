import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchSeriesMetadata, splitSeason } from './tmdb-series';
const upstream = vi.hoisted(() => vi.fn());
vi.mock('./fetch-utils', () => ({ fetchUpstream: upstream, getCache: () => undefined, setCache: vi.fn() }));
beforeEach(() => { vi.stubEnv('TMDB_READ_ACCESS_TOKEN', 'test-token'); upstream.mockReset(); });
afterEach(() => vi.unstubAllEnvs());
describe('TMDB series metadata', () => {
  it('parses season numbers without stripping the show title', () => {
    expect(splitSeason('现在就出发 第二季')).toEqual({ base: '现在就出发', season: 2 });
    expect(splitSeason('示例 第十一季').season).toBe(11);
    expect(splitSeason('示例 Season 3').season).toBe(3);
  });
  it('keeps source season year separate from first-air year', async () => {
    upstream.mockResolvedValueOnce(Response.json({ results: [{ id: 9, name: '示例', first_air_date: '2022-01-01' }] }))
      .mockResolvedValueOnce(Response.json({ seasons: [{ season_number: 2, air_date: '2024-01-01', name: '第2季', episode_count: 1 }] }))
      .mockResolvedValueOnce(Response.json({ episodes: [{ episode_number: 1, name: '重逢', still_path: '/abc.jpg', air_date: '2024-01-01', runtime: 45 }] }));
    const result = await fetchSeriesMetadata('示例 第二季', '2024');
    expect(result?.episodes[0]).toMatchObject({ name: '重逢', runtime: 45, date: '2024-01-01', image: 'https://image.tmdb.org/t/p/w1280/abc.jpg' });
  });
  it('refuses ambiguous exact matches', async () => {
    upstream.mockResolvedValueOnce(Response.json({ results: [{ id: 1, name: '示例', first_air_date: '2024-01-01' }, { id: 2, name: '示例', first_air_date: '2024-02-01' }] }));
    expect(await fetchSeriesMetadata('示例', '2024')).toBeNull();
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
