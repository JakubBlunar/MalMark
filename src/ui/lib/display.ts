import { t } from '../../shared/i18n';
import type { Anime } from '../../shared/types';

export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export const siteName = (site?: string) =>
  site === 'crunchyroll' ? 'Crunchyroll' : t('Custom website');

export function progressListNote(anime: Anime): string {
  const status = anime.my_list_status?.status;
  if (!status) return t('Adds this anime to Currently Watching when progress is saved.');
  if (status === 'plan_to_watch' || status === 'on_hold')
    return t('Moves this anime to Currently Watching when progress is saved.');
  if (status === 'completed') return t('Keeps your Completed status.');
  if (status === 'dropped') return t('Keeps your Dropped status.');
  return '';
}
