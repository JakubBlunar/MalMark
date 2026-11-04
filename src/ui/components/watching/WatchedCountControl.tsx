import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import type { Anime } from '../../../shared/types';
import type { Act } from '../../types';
import { Spinner } from '../shared/Spinner';
import { progressListNote } from '../../lib/display';

export function WatchedCountControl({
  anime,
  episode,
  busy,
  act,
}: {
  anime: Anime;
  episode: number | null;
  busy: string;
  act: Act;
}) {
  const { t } = useTranslation();
  const watched = anime.my_list_status?.num_episodes_watched ?? 0;
  const [count, setCount] = useState(String(watched));
  useEffect(() => setCount(String(watched)), [anime.id, watched]);
  const target = Number(count);
  const max = anime.num_episodes || 10000;
  const fullyLogged = !!anime.num_episodes && watched >= anime.num_episodes;
  const valid = count !== '' && Number.isInteger(target) && target >= 0 && target <= max;
  return (
    <form
      className="watched-control"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || target === watched) return;
        void act(
          'watched',
          { type: 'SET_WATCHED', animeId: anime.id, episode: target, expectedPrevious: watched },
          t('MAL progress set to {{count}} watched episodes.', { count: target }),
        );
      }}
    >
      <div className="watched-heading">
        <label htmlFor="watched-count">{t('Watched on MAL')}</label>
        {episode !== null && episode <= max && episode !== target && (
          <button
            className="text-button"
            type="button"
            disabled={!!busy}
            onClick={() => setCount(String(episode))}
          >
            {t('Use episode')} {episode}
          </button>
        )}
      </div>
      <div className="watched-actions">
        <div className="count-stepper">
          <button
            type="button"
            aria-label={t('Decrease watched episodes')}
            disabled={!!busy || !valid || target <= 0}
            onClick={() => setCount(String(target - 1))}
          >
            <Minus size={15} />
          </button>
          <input
            id="watched-count"
            aria-label={t('Watched episodes on MAL')}
            type="number"
            required
            min="0"
            max={max}
            step="1"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            disabled={!!busy}
          />
          <button
            type="button"
            aria-label={t('Increase watched episodes')}
            disabled={!!busy || !valid || target >= max}
            onClick={() => setCount(String(target + 1))}
          >
            <Plus size={15} />
          </button>
        </div>
        <button className="button secondary" disabled={!!busy || !valid || target === watched}>
          {busy === 'watched' ? <Spinner /> : <Check size={14} />} {t('Save to MAL')}
        </button>
      </div>
      <p className={`helper ${valid && target < watched ? 'warning-text' : ''}`}>
        {valid && target !== watched
          ? t(
              target < watched
                ? 'Reduces your watched total from {{previous}} to {{count}}.'
                : 'Updates your watched total from {{previous}} to {{count}}.',
              { previous: watched, count: target },
            )
          : fullyLogged
            ? t(
                'Already fully logged. Rewatching keeps this total unless you save a different count.',
              )
            : t('Adjust the total anytime, even if the player skipped ahead.')}
      </p>
      {valid && target < watched && (
        <p className="helper">{t('Later episodes will be tracked again from this count.')}</p>
      )}
      {valid && target > watched && progressListNote(anime) && (
        <p className="helper">{progressListNote(anime)}</p>
      )}
    </form>
  );
}
