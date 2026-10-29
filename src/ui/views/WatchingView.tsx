import { ChevronRight, ShieldCheck } from 'lucide-react';
import type { Navigate, ViewProps } from '../types';
import { SignInCard } from '../components/watching/SignInCard';
import { PendingUpdateCard } from '../components/watching/PendingUpdateCard';
import { NowPlayingCard } from '../components/watching/NowPlayingCard';
import { PlayerAccessCard } from '../components/watching/PlayerAccessCard';
import { EpisodeCorrection } from '../components/watching/EpisodeCorrection';
import { EmptyWatchingState } from '../components/watching/EmptyWatchingState';

export function WatchingView({
  state,
  tabId,
  busy,
  act,
  go,
  signIn,
}: ViewProps & { go: Navigate; signIn: () => Promise<void> }) {
  const s = state.session;
  return (
    <>
      <div className="section-heading">
        <span className="eyebrow">YOUR WATCH COMPANION</span>
        <span className="quiet-tag">
          <i className={s?.playerConnected ? 'pulse' : ''} />
          {s?.playerConnected
            ? 'Player connected'
            : s
              ? 'Waiting for player'
              : 'Ready when you are'}
        </span>
      </div>
      {!state.connected ? (
        <SignInCard
          session={s}
          busy={busy}
          signIn={signIn}
          oauth={state.oauth}
          redirectUrl={state.redirectUrl}
          act={act}
        />
      ) : (
        <>
          {state.pending.map((item) => (
            <PendingUpdateCard
              key={item.id}
              item={item}
              busy={busy}
              act={act}
              autoFinishDate={state.settings.autoFinishDate}
            />
          ))}
          {s ? (
            <>
              <NowPlayingCard
                session={s}
                settings={state.settings}
                tabId={tabId}
                busy={busy}
                act={act}
                go={go}
              />
              {!s.playerConnected &&
                s.frameOrigins.filter((origin) => !state.playerPermissions.includes(origin + '/*'))
                  .length > 0 && (
                  <PlayerAccessCard
                    session={s}
                    permissions={state.playerPermissions}
                    tabId={tabId}
                    busy={busy}
                    act={act}
                  />
                )}
              <EpisodeCorrection
                key={`${tabId}/${s.detection.url}`}
                session={s}
                tabId={tabId}
                busy={busy}
                act={act}
              />
              <div className="subtle-note">
                <ShieldCheck size={14} />
                <span>
                  {state.settings.autoProgress
                    ? 'Automatic progress is on for next episodes. Other changes need your confirmation.'
                    : 'We’ll ask before updating your list. Automatic progress is off.'}
                </span>
              </div>
            </>
          ) : (
            <EmptyWatchingState go={go} />
          )}
        </>
      )}
      <div className="how-it-works">
        <div>
          <span>01</span>
          <p>Play an episode</p>
        </div>
        <ChevronRight size={13} />
        <div>
          <span>02</span>
          <p>Find your match</p>
        </div>
        <ChevronRight size={13} />
        <div>
          <span>03</span>
          <p>{state.settings.autoProgress ? 'Track & log' : 'Confirm & log'}</p>
        </div>
      </div>
    </>
  );
}
