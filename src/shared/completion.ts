import type { Anime } from './types';

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
