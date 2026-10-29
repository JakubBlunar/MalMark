import type { Anime } from './types';

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function canCompleteAnime(
  anime: Anime,
  watched = anime.my_list_status?.num_episodes_watched ?? 0,
): boolean {
  return (
    anime.status === 'finished_airing' &&
    Number.isInteger(anime.num_episodes) &&
    (anime.num_episodes ?? 0) > 0 &&
    watched >= anime.num_episodes! &&
    !!anime.my_list_status &&
    anime.my_list_status.status !== 'completed' &&
    !anime.my_list_status.is_rewatching
  );
}
