import type { CategorySlug } from './categories';
import type { MediaItem } from './types';

/**
 * A short secondary line for a media item, built from its category-specific
 * extras: authors, studio, artist, platforms, or episode/season counts.
 * Returns null when nothing useful is stored.
 */
export function mediaSubtitle(media: MediaItem, slug: CategorySlug): string | null {
  const list = (v: unknown, max = 2): string | null =>
    Array.isArray(v) && v.length > 0 ? v.slice(0, max).join(', ') : null;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;

  switch (slug) {
    case 'books':
      return list(media.authors);
    case 'movies': {
      const runtime = num(media.runtime);
      return runtime ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : null;
    }
    case 'tv': {
      const seasons = num(media.seasonCount);
      const eps = num(media.episodeCount);
      const parts = [
        seasons && `${seasons} season${seasons === 1 ? '' : 's'}`,
        eps && `${eps} episodes`,
      ].filter(Boolean);
      return parts.length ? parts.join(' · ') : null;
    }
    case 'anime': {
      const studio = typeof media.studio === 'string' ? media.studio : null;
      const eps = num(media.episodes);
      const parts = [studio, eps && `${eps} ep`].filter(Boolean);
      return parts.length ? parts.join(' · ') : null;
    }
    case 'manga': {
      const ch = num(media.chapters);
      const vol = num(media.volumes);
      const parts = [vol && `${vol} vol`, ch && `${ch} ch`].filter(Boolean);
      return parts.length ? parts.join(' · ') : null;
    }
    case 'games':
      return list(media.platforms, 3);
    case 'music':
      return typeof media.artist === 'string' ? media.artist : null;
  }
}
