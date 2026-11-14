import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./fetch-utils', () => ({
  fetchUpstream: vi.fn(),
  getCache: vi.fn(() => undefined),
  setCache: vi.fn(),
}));

import { fetchDoubanHero } from './douban';
import { fetchUpstream } from './fetch-utils';

const fetchMock = vi.mocked(fetchUpstream);

beforeEach(() => fetchMock.mockReset());

describe('hero requests', () => {
  it('shares a concurrent cold request and retries after failure', async () => {
    let finish!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const first = fetchDoubanHero('movie');
    const second = fetchDoubanHero('movie');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(new Response(JSON.stringify({ subjects: [] }), { status: 200 }));
    expect(await Promise.all([first, second])).toEqual([[], []]);

    fetchMock.mockRejectedValueOnce(new Error('upstream unavailable'));
    await expect(fetchDoubanHero('movie')).rejects.toThrow('豆瓣推荐获取失败');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ subjects: [] }), { status: 200 }));
    await expect(fetchDoubanHero('movie')).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
