import type { Anime } from '../../shared/types';

export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export const siteName = (site?: string) =>
  site === 'crunchyroll' ? 'Crunchyroll' : 'Custom website';

export function progressListNote(anime: Anime): string {
  const status = anime.my_list_status?.status;
  if (!status) return 'Adds this anime to Currently Watching when progress is saved.';
  if (status === 'plan_to_watch' || status === 'on_hold')
    return 'Moves this anime to Currently Watching when progress is saved.';
  if (status === 'completed') return 'Keeps your Completed status.';
  if (status === 'dropped') return 'Keeps your Dropped status.';
  return '';
}
