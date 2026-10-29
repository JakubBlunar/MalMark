import { useState, useEffect } from 'react';
import { Check, LogOut, Radio, UserRound } from 'lucide-react';
import type { PublicState, Settings } from '../../../shared/types';
import type { Act } from '../../types';
import { Spinner } from '../shared/Spinner';

export function PreferencesForm({
  state,
  busy,
  act,
}: {
  state: Pick<PublicState, 'settings' | 'connected' | 'profile'>;
  busy: string;
  act: Act;
}) {
  const [draft, setDraft] = useState<Settings>(state.settings);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(state.settings);
  }, [state.settings, dirty]);
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDirty(true);
    setDraft({ ...draft, [key]: value });
  };

  return (
    <section className="card settings-section">
      <div className="settings-heading">
        <span className="setting-icon">
          <UserRound size={18} />
        </span>
        <div>
          <h2>MyAnimeList connection</h2>
          <p>
            {state.connected
              ? `Connected as ${state.profile?.name || 'MAL user'}`
              : 'One account. Your whole watchlist.'}
          </p>
        </div>
        <span className={`status-dot ${state.connected ? 'online' : ''}`} />
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act('settings', { type: 'SAVE_SETTINGS', settings: draft }, 'Settings saved.').then(
            (ok) => {
              if (ok) setDirty(false);
            },
          );
        }}
      >
        <div className="settings-divider" />
        <div className="settings-heading">
          <span className="setting-icon">
            <Radio size={18} />
          </span>
          <div>
            <h2>Watch tracking</h2>
            <p>Choose how finished episodes update your list.</p>
          </div>
        </div>
        <label className="toggle-row" htmlFor="auto-progress">
          <span>
            <b>Automatic progress updates</b>
            <small>
              Log only the next episode of anime in Currently Watching after reaching the threshold.
              Other cases ask for confirmation. Success appears for four seconds.
            </small>
          </span>
          <input
            id="auto-progress"
            type="checkbox"
            checked={draft.autoProgress}
            onChange={(e) => change('autoProgress', e.target.checked)}
          />
          <i className="toggle" />
        </label>
        <label htmlFor="threshold" className="range-label">
          Completion threshold <b>{draft.threshold}%</b>
        </label>
        <input
          id="threshold"
          type="range"
          min="50"
          max="100"
          step="1"
          value={draft.threshold}
          onChange={(e) => change('threshold', Number(e.target.value))}
        />
        <p className="helper">
          Based on time actually watched. 65% works well when you skip recaps, openings and credits.
        </p>
        <label className="toggle-row" htmlFor="prompt-at-end">
          <span>
            <b>Also remind me near the end</b>
            <small>At 95% of the timeline, if at least half was watched. Survives autoplay.</small>
          </span>
          <input
            id="prompt-at-end"
            type="checkbox"
            checked={draft.promptAtEnd}
            onChange={(e) => change('promptAtEnd', e.target.checked)}
          />
          <i className="toggle" />
        </label>
        <label htmlFor="min-seconds">Minimum watched time (seconds)</label>
        <input
          id="min-seconds"
          type="number"
          min="30"
          max="600"
          step="1"
          required
          value={draft.minWatchSeconds}
          onChange={(e) => change('minWatchSeconds', Number(e.target.value))}
        />
        <label className="toggle-row" htmlFor="show-prompts">
          <span>
            <b>In-page prompts</b>
            <small>
              Show manual reminders over the watch page. Automatic updates always show a brief
              confirmation.
            </small>
          </span>
          <input
            id="show-prompts"
            type="checkbox"
            checked={draft.showPrompts}
            onChange={(e) => change('showPrompts', e.target.checked)}
          />
          <i className="toggle" />
        </label>
        <button disabled={!!busy} className="button secondary wide" type="submit">
          {busy === 'settings' ? <Spinner /> : <Check size={15} />} Save settings
          {dirty && <span className="unsaved-dot" />}
        </button>
      </form>
      {state.connected && (
        <button
          disabled={!!busy}
          className="text-button disconnect"
          onClick={() => void act('logout', { type: 'LOGOUT' }, 'Account disconnected.')}
        >
          <LogOut size={14} /> Disconnect account
        </button>
      )}
    </section>
  );
}
