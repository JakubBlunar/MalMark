import type { Anime, ListStatus } from './types';

// Send status and count together so a new entry is created with its watched progress.
export function progressUpdateValues(
  anime: Anime,
  episode: number,
): { num_watched_episodes: number; status?: ListStatus['status'] } {
  const status = anime.my_list_status?.status;
  return {
    num_watched_episodes: episode,
    ...(!status || status === 'plan_to_watch' || status === 'on_hold'
      ? { status: 'watching' as const }
      : {}),
  };
}
