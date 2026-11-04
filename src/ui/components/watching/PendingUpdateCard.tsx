import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, CircleCheck } from 'lucide-react';
import type { PendingUpdate } from '../../../shared/types';
import type { Act } from '../../types';
import { Spinner } from '../shared/Spinner';
import { progressListNote } from '../../lib/display';
import { CompleteAnimeControl } from './CompleteAnimeControl';

export function PendingUpdateCard({
  item,
  busy,
  act,
  autoFinishDate,
}: {
  item: PendingUpdate;
  busy: string;
  act: Act;
  autoFinishDate: boolean;
}) {
  const { t } = useTranslation();
  return (
    <section className="card pending-card">
      <div className="eyebrow mint">
        <CircleCheck size={14} /> {t('READY TO LOG')}
      </div>
      <h2>{t('Another episode, in the books.')}</h2>
      <p>{item.anime.alternative_titles?.en || item.anime.title}</p>
      {progressListNote(item.anime) && <p className="helper">{progressListNote(item.anime)}</p>}
      {item.error && (
        <p className="helper warning-text" role="alert">
          {item.error}
        </p>
      )}
      <div className="progress-change">
        <span>
          {item.previous}
          <small>{t('ON MYANIMELIST')}</small>
        </span>
        <ArrowRight size={24} />
        <span className="new-count">
          {item.episode}
          <small>{t('EPISODES WATCHED')}</small>
        </span>
      </div>
      {item.episode > item.previous + 1 && (
        <p className="helper warning-text">
          {t(
            'This also marks episodes {{first}}–{{last}} as watched. MAL stores a total episode count.',
            { first: item.previous + 1, last: item.episode - 1 },
          )}
        </p>
      )}
      <div className="button-row">
        <button
          disabled={!!busy}
          className="button primary grow"
          onClick={() =>
            void act(
              item.id,
              { type: 'APPROVE_UPDATE', id: item.id },
              t('Progress updated on MyAnimeList.'),
            )
          }
        >
          {busy === item.id ? <Spinner /> : <Check size={16} />} {t('Update progress')}
        </button>
        <button
          disabled={!!busy}
          className="button secondary"
          onClick={() =>
            void act('skip', { type: 'DISMISS_UPDATE', id: item.id }, t('Update skipped.'))
          }
        >
          {t('Skip')}
        </button>
      </div>
      <CompleteAnimeControl
        key={item.anime.id}
        anime={item.anime}
        pending={item}
        busy={busy}
        act={act}
        autoFinishDate={autoFinishDate}
      />
    </section>
  );
}
