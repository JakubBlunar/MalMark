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
  return (
    <section className="card pending-card">
      <div className="eyebrow mint">
        <CircleCheck size={14} /> READY TO LOG
      </div>
      <h2>Another episode, in the books.</h2>
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
          <small>ON MYANIMELIST</small>
        </span>
        <ArrowRight size={24} />
        <span className="new-count">
          {item.episode}
          <small>EPISODES WATCHED</small>
        </span>
      </div>
      {item.episode > item.previous + 1 && (
        <p className="helper warning-text">
          This also marks episodes {item.previous + 1}–{item.episode - 1} as watched. MAL stores a
          total episode count.
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
              'Progress updated on MyAnimeList.',
            )
          }
        >
          {busy === item.id ? <Spinner /> : <Check size={16} />} Update progress
        </button>
        <button
          disabled={!!busy}
          className="button secondary"
          onClick={() =>
            void act('skip', { type: 'DISMISS_UPDATE', id: item.id }, 'Update skipped.')
          }
        >
          Skip
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
