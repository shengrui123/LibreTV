import { describe, expect, it } from 'vitest';
import { cleanTmdbBackdrops } from './tmdb-backdrops';
describe('TMDB detail backdrops', () => {
  it('keeps only full-HD language-neutral landscape artwork', () => {
    const base = { file_path: '/clean.jpg', width: 1920, height: 1080, iso_639_1: null };
    expect(cleanTmdbBackdrops([
      base, { ...base, file_path: '/title.jpg', iso_639_1: 'zh' },
      { ...base, file_path: '/subtitle.jpg', iso_639_1: 'en' },
      { ...base, file_path: '/unknown.jpg', iso_639_1: undefined },
      { ...base, file_path: '/small.jpg', width: 1280, height: 720 },
      { ...base, file_path: '/poster.jpg', width: 2000, height: 3000 },
      { ...base, file_path: 'https://other.test/image.jpg' }, base,
    ])).toEqual(['https://image.tmdb.org/t/p/original/clean.jpg']);
  });
  it('returns no image rather than falling back to a poster', () => {
    expect(cleanTmdbBackdrops()).toEqual([]);
  });
});
