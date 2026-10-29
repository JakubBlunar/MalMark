import { ChevronRight, CircleAlert, CircleCheck } from 'lucide-react';
import type { Settings, WatchSession } from '../../../shared/types';
import type { Act, Navigate } from '../../types';
import { siteName } from '../../lib/display';
import { WatchedCountControl } from './WatchedCountControl';
import { AnimeInfo } from './AnimeInfo';
import { WatchProgressBar } from './WatchProgress';
import { AnimeListStatus } from './AnimeListStatus';
import { CompleteAnimeControl } from './CompleteAnimeControl';

export function NowPlayingCard({
  session: s,
  settings,
  tabId,
  busy,
  act,
  go,
}: {
  session: WatchSession;
  settings: Settings;
  tabId?: number;
  busy: string;
  act: Act;
  go: Navigate;
}) {
  const anime = s.anime;
  return (
    <section className="card watching-card">
      <div className="card-topline">
        <span className="eyebrow">NOW PLAYING</span>
        <span className={`site-pill ${s.detection.site}`}>{siteName(s.detection.site)}</span>
      </div>
      <AnimeInfo session={s} />
      <div className={`match-strip ${anime ? 'matched' : ''}`}>
        {anime ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
        <span>
          {anime
            ? `${s.matchSource === 'manual' ? 'Saved match' : 'Matched'} on MyAnimeList`
            : 'Let’s find the right anime'}
        </span>
        <button onClick={() => go('matches')}>
          {anime ? 'Change' : 'Find match'}
          <ChevronRight size={14} />
        </button>
      </div>
      {s.error && <div className="inline-error">{s.error}</div>}
      <WatchProgressBar progress={s.progress} connected={s.playerConnected} settings={settings} />
      <AnimeListStatus anime={anime} tabId={tabId} busy={busy} act={act} />
      {anime?.my_list_status?.is_rewatching && (
        <p className="helper callout">
          Rewatch detected. Update rewatch progress directly on MAL; Malmark keeps the original
          watch count intact.
        </p>
      )}
      {anime && !anime.my_list_status?.is_rewatching && (
        <WatchedCountControl anime={anime} episode={s.episode} busy={busy} act={act} />
      )}
      {anime && <CompleteAnimeControl key={anime.id} anime={anime} busy={busy} act={act} />}
      {s.episode && anime?.num_episodes && s.episode > anime.num_episodes ? (
        <div className="callout warning-text">
          Episode {s.episode} exceeds this MAL entry. Set an episode offset in Matches.
        </div>
      ) : null}
    </section>
  );
}
