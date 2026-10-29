import type { Anime, Settings, WatchProgress } from '../shared/types';
import { isComplete } from '../shared/progress';
import { getAnime, updateAnime } from './mal';
import { getAuth } from './storage';

type Result = { kind: 'manual' | 'updated' | 'already-logged'; anime: Anime; error?: string };

function nextEpisode(anime: Anime, episode: number): boolean {
  const list = anime.my_list_status;
  return (
    !!list &&
    list.status === 'watching' &&
    !list.is_rewatching &&
    Number.isInteger(list.num_episodes_watched) &&
    episode === list.num_episodes_watched + 1 &&
    (!anime.num_episodes || episode <= anime.num_episodes)
  );
}

export async function automaticProgress(
  anime: Anime,
  episode: number,
  progress: WatchProgress,
  settings: Settings,
): Promise<Result> {
  if (
    !settings.autoProgress ||
    !nextEpisode(anime, episode) ||
    !isComplete(progress, { ...settings, promptAtEnd: false })
  )
    return { kind: 'manual', anime };
  let fresh = anime;
  try {
    const account = (await getAuth())?.profile?.id;
    fresh = await getAnime(anime.id);
    if (fresh.my_list_status && fresh.my_list_status.num_episodes_watched >= episode)
      return { kind: 'already-logged', anime: fresh };
    if (!nextEpisode(fresh, episode)) return { kind: 'manual', anime: fresh };
    if (account === undefined || (await getAuth())?.profile?.id !== account)
      throw new Error('The connected account changed. Review this update in Malmark.');
    const updated = await updateAnime(anime.id, { num_watched_episodes: episode });
    if (updated.num_episodes_watched !== episode)
      throw new Error(
        'MyAnimeList did not confirm the new episode count. Review this update in Malmark.',
      );
    return { kind: 'updated', anime: { ...fresh, my_list_status: updated } };
  } catch (error) {
    return {
      kind: 'manual',
      anime: fresh,
      error: `Automatic update failed. ${error instanceof Error ? error.message : 'Try again in Malmark.'}`,
    };
  }
}
