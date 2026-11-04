import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link2, Radio } from 'lucide-react';
import type { Anime } from '../../shared/types';
import { findMapping } from '../../shared/sites';
import type { ViewProps } from '../types';
import { siteName } from '../lib/display';
import { useAnimeSearch } from '../hooks/useAnimeSearch';
import { AnimeSearchResults } from '../components/matching/AnimeSearchResults';
import { MatchDetailsForm } from '../components/matching/MatchDetailsForm';
import { SavedMatches } from '../components/matching/SavedMatches';

export function MatchesView({ state, tabId, busy, act }: ViewProps) {
  const { t } = useTranslation();
  const session = state.session;
  const identity = `${tabId}/${session?.detection.seriesKey}/${session?.detection.url}`;
  const search = useAnimeSearch(
    session?.matchSearch?.query || session?.detection.title || '',
    identity,
    session?.match === 'unmatched' ? session.matchSearch?.results : undefined,
  );
  const [selected, setSelected] = useState<Anime>();
  const existing = session ? findMapping(state.mappings, session.detection) : undefined;
  useEffect(() => setSelected(undefined), [identity]);

  return (
    <>
      <div className="page-title">
        <span className="eyebrow">{t('THE RIGHT ANIME. EVERY TIME.')}</span>
        <h1>{t('Make the connection.')}</h1>
        <p>{t('Match a watch page once. We’ll remember it.')}</p>
      </div>
      {session ? (
        <section className="card match-form">
          <div className="eyebrow accent">
            <Radio size={13} /> {t('DETECTED ON')} {siteName(session.detection.site).toUpperCase()}
          </div>
          <h3>{session.detection.title}</h3>
          <p className="helper">
            {session.detection.season
              ? t('Season {{season}} · ', { season: session.detection.season })
              : ''}
            {t('Episode')} {session.detection.episode ?? t('unknown')} {t('on the streaming site')}
          </p>
          {!state.connected ? (
            <div className="callout">{t('Sign in to MyAnimeList to search and save a match.')}</div>
          ) : (
            <div className="match-workspace">
              {selected ? (
                <MatchDetailsForm
                  key={identity}
                  selected={selected}
                  session={session}
                  existing={existing}
                  tabId={tabId}
                  busy={busy}
                  act={act}
                  onBack={() => setSelected(undefined)}
                  onSaved={() => {
                    setSelected(undefined);
                    search.clearResults();
                  }}
                />
              ) : (
                <AnimeSearchResults search={search} busy={busy} onSelect={setSelected} />
              )}
            </div>
          )}
        </section>
      ) : (
        <div className="card compact-empty">
          <Link2 size={24} />
          <h3>{t('Start with a watch page')}</h3>
          <p>{t('Open an episode to search for a match and save its URL rule.')}</p>
        </div>
      )}
      <SavedMatches mappings={state.mappings} busy={busy} act={act} />
    </>
  );
}
