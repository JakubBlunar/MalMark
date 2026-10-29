import { BookOpen, ExternalLink, Plus } from 'lucide-react';
import type { Anime } from '../../../shared/types';
import type { Act } from '../../types';
import { Spinner } from '../shared/Spinner';

export function AnimeListStatus({
  anime,
  tabId,
  busy,
  act,
}: {
  anime?: Anime;
  tabId?: number;
  busy: string;
  act: Act;
}) {
  return (
    <>
      {anime?.my_list_status ? (
        <div className="list-status">
          <BookOpen size={16} />
          <div>
            <b>{anime.my_list_status.status.replaceAll('_', ' ')}</b>
            <span>
              {anime.my_list_status.num_episodes_watched} of {anime.num_episodes || '?'} episodes on
              MAL
            </span>
            {anime.my_list_status.score ? (
              <span>Your score: {anime.my_list_status.score}/10</span>
            ) : null}
          </div>
          <a
            className="icon-button"
            aria-label="Open anime on MyAnimeList"
            href={`https://myanimelist.net/anime/${anime.id}`}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={15} />
          </a>
        </div>
      ) : (
        anime && (
          <div className="add-watching">
            <h3>A new addition to your list?</h3>
            <p>
              Add this anime to Currently Watching. Progress is only updated after you approve it.
            </p>
            <button
              disabled={!!busy}
              className="button primary wide"
              onClick={() =>
                void act(
                  'add',
                  { type: 'ADD_WATCHING', tabId: tabId! },
                  'Added to Currently Watching.',
                )
              }
            >
              {busy === 'add' ? <Spinner /> : <Plus size={16} />} Add to Currently Watching
            </button>
          </div>
        )
      )}
    </>
  );
}
