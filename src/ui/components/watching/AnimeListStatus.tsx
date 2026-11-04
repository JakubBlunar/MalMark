import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  return (
    <>
      {anime?.my_list_status ? (
        <div className="list-status">
          <BookOpen size={16} />
          <div>
            <b>
              {t(
                {
                  watching: 'Watching',
                  completed: 'Completed',
                  on_hold: 'On hold',
                  dropped: 'Dropped',
                  plan_to_watch: 'Plan to watch',
                }[anime.my_list_status.status],
              )}
            </b>
            <span>
              {t('{{watched}} of {{total}} episodes on MAL', {
                watched: anime.my_list_status.num_episodes_watched,
                total: anime.num_episodes || '?',
              })}
            </span>
            {anime.my_list_status.score ? (
              <span>
                {t('Your score:')} {anime.my_list_status.score}/10
              </span>
            ) : null}
            {anime.my_list_status.finish_date && (
              <span>
                {t('Finished:')} {anime.my_list_status.finish_date}
              </span>
            )}
          </div>
          <a
            className="icon-button"
            aria-label={t('Open anime on MyAnimeList')}
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
            <h3>{t('A new addition to your list?')}</h3>
            <p>
              {t(
                'Saving episode progress adds this anime to Currently Watching automatically. You can also add it now without logging an episode.',
              )}
            </p>
            <button
              disabled={!!busy}
              className="button primary wide"
              onClick={() =>
                void act(
                  'add',
                  { type: 'ADD_WATCHING', tabId: tabId! },
                  t('Added to Currently Watching.'),
                )
              }
            >
              {busy === 'add' ? <Spinner /> : <Plus size={16} />} {t('Add to Currently Watching')}
            </button>
          </div>
        )
      )}
    </>
  );
}
