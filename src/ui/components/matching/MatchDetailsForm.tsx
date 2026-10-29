import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ExternalLink, Link2 } from 'lucide-react';
import type { Anime, Mapping, WatchSession } from '../../../shared/types';
import { defaultPrefix } from '../../../shared/sites';
import type { Act } from '../../types';
import { AnimeCover } from '../shared/AnimeCover';
import { Spinner } from '../shared/Spinner';

export function MatchDetailsForm({
  selected,
  session,
  existing,
  tabId,
  busy,
  act,
  onBack,
  onSaved,
}: {
  selected: Anime;
  session: WatchSession;
  existing?: Mapping;
  tabId?: number;
  busy: string;
  act: Act;
  onBack: () => void;
  onSaved: () => void;
}) {
  const [prefix, setPrefix] = useState(existing?.prefix || defaultPrefix(session.detection));
  const [offset, setOffset] = useState(String(existing?.episodeOffset || 0));
  const saveButton = useRef<HTMLButtonElement>(null);
  useEffect(() => saveButton.current?.focus({ preventScroll: true }), []);

  return (
    <form
      className="mapping-details"
      onSubmit={(event) => {
        event.preventDefault();
        void act(
          'mapping',
          {
            type: 'SAVE_MAPPING',
            tabId: tabId!,
            animeId: selected.id,
            prefix,
            episodeOffset: Number(offset),
          },
          'Match saved on this device. Watch tracking restarted.',
        ).then((ok) => {
          if (ok) onSaved();
        });
      }}
    >
      <button type="button" className="text-button match-back" onClick={onBack}>
        <ArrowRight size={14} /> Back to results
      </button>
      <div className="selected-summary">
        <AnimeCover anime={selected} />
        <span>
          <small>SELECTED MATCH</small>
          <b>{selected.alternative_titles?.en || selected.title}</b>
          <small>
            {selected.start_season?.year || '—'} · {selected.num_episodes || '?'} episodes
          </small>
        </span>
      </div>
      <a
        className="text-button"
        href={`https://myanimelist.net/anime/${selected.id}`}
        target="_blank"
        rel="noreferrer"
      >
        Verify the season on MAL <ExternalLink size={12} />
      </a>
      <button ref={saveButton} disabled={!!busy} className="button primary wide">
        {busy === 'mapping' ? <Spinner /> : <Link2 size={16} />} Save match
      </button>
      <details className="match-advanced">
        <summary>URL rule &amp; episode offset</summary>
        <label htmlFor="url-prefix">Remember for this URL prefix</label>
        <input
          id="url-prefix"
          required
          type="url"
          value={prefix}
          onChange={(event) => setPrefix(event.target.value)}
        />
        <p className="helper">
          {session.detection.site === 'crunchyroll'
            ? 'Crunchyroll rules also match the detected series and season, since each episode has its own URL.'
            : 'The detected series also scopes this rule. A domain-wide prefix works even when episode URLs change completely.'}
        </p>
        <label htmlFor="episode-offset">Episode offset</label>
        <input
          id="episode-offset"
          type="number"
          required
          step="1"
          min="-10000"
          max="10000"
          value={offset}
          onChange={(event) => setOffset(event.target.value)}
        />
        <p className="helper">
          MAL episode = site episode + offset. Example: site 25 → MAL 1 uses −24.
        </p>
      </details>
    </form>
  );
}
