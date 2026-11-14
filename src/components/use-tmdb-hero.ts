'use client';
import { useQuery } from '@tanstack/react-query';
import type { TmdbHero } from '@/lib/tmdb-hero';

export function useTmdbHero(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ['tmdb-hero', id],
    queryFn: async ({ signal }): Promise<TmdbHero | null> => {
      const response = await fetch(`/api/tmdb-hero?id=${encodeURIComponent(id)}`, { signal });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: enabled && /^\d{1,12}$/.test(id),
    staleTime: 6 * 60 * 60_000,
    retry: false,
  });
}
