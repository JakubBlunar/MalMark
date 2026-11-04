import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { WatchSession } from '../../../shared/types';
import type { Act } from '../../types';

export function EpisodeCorrection({
  session: s,
  tabId,
  busy,
  act,
}: {
  session: WatchSession;
  tabId?: number;
  busy: string;
  act: Act;
}) {
  const { t } = useTranslation();
  const [episodeInput, setEpisodeInput] = useState('');
  const [editingEpisode, setEditingEpisode] = useState(false);
  return (
    <>
      <div className="watch-tools">
        <button
          className="text-button muted"
          onClick={() => {
            setEditingEpisode(!editingEpisode);
            setEpisodeInput(String(s.episode || ''));
          }}
        >
          {t('Correct episode')}
        </button>
        <button
          disabled={!!busy}
          className="text-button muted"
          onClick={() =>
            void act('recheck', { type: 'RECHECK', tabId: tabId! }, t('Page checked again.'))
          }
        >
          <RefreshCw size={13} className={busy === 'recheck' ? 'spin' : ''} /> {t('Check again')}
        </button>
      </div>
      {editingEpisode && (
        <form
          className="card compact-form"
          onSubmit={(event) => {
            event.preventDefault();
            void act(
              'episode',
              {
                type: 'SET_EPISODE',
                tabId: tabId!,
                episode: Number(episodeInput),
              },
              t('Episode corrected. Watch tracking restarted.'),
            ).then((ok) => {
              if (ok) setEditingEpisode(false);
            });
          }}
        >
          <label htmlFor="episode-number">{t('MAL episode number for this page')}</label>
          <div className="button-row">
            <input
              id="episode-number"
              type="number"
              min="1"
              step="1"
              required
              value={episodeInput}
              onChange={(e) => setEpisodeInput(e.target.value)}
            />
            <button className="button primary" disabled={!!busy}>
              {t('Set episode')}
            </button>
          </div>
          <p className="helper">
            {t('Applies to this episode only. Use a saved match offset for future episodes.')}
          </p>
        </form>
      )}
    </>
  );
}
