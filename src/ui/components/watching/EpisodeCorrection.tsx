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
          Correct episode
        </button>
        <button
          disabled={!!busy}
          className="text-button muted"
          onClick={() =>
            void act('recheck', { type: 'RECHECK', tabId: tabId! }, 'Page checked again.')
          }
        >
          <RefreshCw size={13} className={busy === 'recheck' ? 'spin' : ''} /> Check again
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
              'Episode corrected. Watch tracking restarted.',
            ).then((ok) => {
              if (ok) setEditingEpisode(false);
            });
          }}
        >
          <label htmlFor="episode-number">MAL episode number for this page</label>
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
              Set episode
            </button>
          </div>
          <p className="helper">
            Applies to this episode only. Use a saved match offset for future episodes.
          </p>
        </form>
      )}
    </>
  );
}
