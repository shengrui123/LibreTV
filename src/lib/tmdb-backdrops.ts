/** Only full-HD, language-neutral landscape artwork is eligible for detail backgrounds. */
export interface TmdbBackdrop { file_path?: string; iso_639_1?: string | null; width?: number; height?: number; vote_count?: number; vote_average?: number }
export function cleanTmdbBackdrops(images: TmdbBackdrop[] = []): string[] {
  return [...new Set(images.filter((image) => image.iso_639_1 === null && typeof image.file_path === 'string' && /^\/[\w-]+\.(jpg|png|webp)$/.test(image.file_path) && (image.width || 0) >= 1920 && (image.height || 0) >= 1080 && image.width! / image.height! >= 1.4)
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0) || (b.width || 0) - (a.width || 0))
    .map((image) => `https://image.tmdb.org/t/p/original${image.file_path}`))].slice(0, 10);
}
