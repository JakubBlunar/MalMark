import { useTranslation } from 'react-i18next';
import { useId, useState } from 'react';
import { CheckCheck, Star } from 'lucide-react';
import type { Anime, PendingUpdate } from '../../../shared/types';
import { canCompleteAnime, localDate } from '../../../shared/completion';
import type { Act } from '../../types';
import { Spinner } from '../shared/Spinner';

interface CompletionProps {
  anime: Anime;
  pending?: PendingUpdate;
  busy: string;
  act: Act;
  autoFinishDate: boolean;
}

export function CompleteAnimeControl(props: CompletionProps) {
  const { anime, pending } = props;
  if (
    (pending && pending.episode !== anime.num_episodes) ||
    !canCompleteAnime(anime, pending?.episode)
  )
    return null;
  return <CompletionForm key={`${anime.id}:${anime.num_episodes}`} {...props} />;
}

function CompletionForm({ anime, pending, busy, act, autoFinishDate }: CompletionProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [score, setScore] = useState('');
  const scoreId = useId();
  const key = `complete:${anime.id}`;
  return (
    <div className="completion-control">
      <div className="completion-heading">
        <CheckCheck size={17} />
        <span>
          {t('Finished Airing ·')} {pending ? t('Final episode') : t('All episodes logged')}
        </span>
      </div>
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void act(
              key,
              {
                type: 'COMPLETE_ANIME',
                animeId: anime.id,
                expectedEpisodes: anime.num_episodes!,
                ...(pending ? { pendingId: pending.id } : {}),
                ...(score === '' ? {} : { score: Number(score) }),
              },
              t('Marked completed on MyAnimeList.'),
            );
          }}
        >
          <p>
            {pending
              ? t('Log all {{count}} episodes and move this anime to Completed.', {
                  count: anime.num_episodes!,
                })
              : t('Move this anime to Completed.')}{' '}
            {t('Your score is optional.')}
          </p>
          <p className="helper">
            {anime.my_list_status?.finish_date
              ? t('Keeps your finish date: {{date}}.', { date: anime.my_list_status.finish_date })
              : autoFinishDate
                ? t('Finish date will be set to today ({{date}}).', { date: localDate() })
                : t(
                    'Finish date stays blank. Enable automatic finish dates in Settings to fill it in.',
                  )}
          </p>
          <label htmlFor={scoreId}>{t('Your score')}</label>
          <select
            id={scoreId}
            value={score}
            onChange={(event) => setScore(event.target.value)}
            disabled={!!busy}
          >
            <option value="">
              {anime.my_list_status?.score
                ? t('Keep current score ({{score}}/10)', { score: anime.my_list_status.score })
                : t('Leave unrated')}
            </option>
            {Array.from({ length: 10 }, (_, index) => 10 - index).map((value) => (
              <option key={value} value={value}>
                {value} / 10
              </option>
            ))}
            {anime.my_list_status?.score ? <option value="0">{t('Remove score')}</option> : null}
          </select>
          <div className="completion-actions">
            <button className="button primary" disabled={!!busy}>
              {busy === key ? <Spinner /> : <CheckCheck size={16} />}
              {t('Save completion')}
            </button>
            <button
              type="button"
              className="text-button"
              disabled={!!busy}
              onClick={() => {
                setEditing(false);
                setScore('');
              }}
            >
              {t('Cancel completion')}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          className="button secondary wide"
          disabled={!!busy}
          onClick={() => setEditing(true)}
        >
          <Star size={15} /> {t('Complete & rate')}
        </button>
      )}
    </div>
  );
}
