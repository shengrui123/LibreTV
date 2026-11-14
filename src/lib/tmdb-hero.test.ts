import { describe, expect, it } from 'vitest';
import { matchTmdbMovie } from './tmdb-hero';

describe('TMDB movie identity', () => {
  const film = { id: 12, title: '可能的爱', original_title: 'Possible Love', release_date: '2026-11-01' };
  it('accepts only an exact title and year', () => {
    expect(matchTmdbMovie([film], '可能的爱', '2026')).toEqual(film);
    expect(matchTmdbMovie([film], '可能的爱', '2025')).toBeUndefined();
    expect(matchTmdbMovie([film], '可能', '2026')).toBeUndefined();
  });
  it('rejects ambiguous matching results', () => {
    expect(matchTmdbMovie([film, { ...film, id: 13 }], '可能的爱', '2026')).toBeUndefined();
  });
});
