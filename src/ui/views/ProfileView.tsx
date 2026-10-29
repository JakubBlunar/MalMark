import {
  ArrowRight,
  CircleCheck,
  ExternalLink,
  Film,
  LogOut,
  Play,
  TvMinimal,
  UserRound,
} from 'lucide-react';
import type { ViewProps } from '../types';

export function ProfileView({
  state,
  busy,
  act,
  signIn,
}: ViewProps & { signIn: () => Promise<void> }) {
  const stats = state.profile?.anime_statistics;
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">YOUR LITTLE ANIME CORNER</span>
        <h1>Profile</h1>
        <p>Your MyAnimeList account, at a glance.</p>
      </div>
      {state.profile ? (
        <>
          <section className="card profile-card">
            <div className="profile-avatar">
              {state.profile.picture ? (
                <img src={state.profile.picture} alt="" />
              ) : (
                <UserRound size={32} />
              )}
            </div>
            <h2>{state.profile.name}</h2>
            <span className="connected-label">
              <i /> Connected to MyAnimeList
            </span>
            {state.profile.location && <p>{state.profile.location}</p>}
            {state.profile.joined_at && (
              <p className="helper">
                Member since{' '}
                {new Date(state.profile.joined_at).toLocaleDateString(undefined, {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
            <a
              className="button secondary"
              href={`https://myanimelist.net/profile/${encodeURIComponent(state.profile.name)}`}
              target="_blank"
              rel="noreferrer"
            >
              View MAL profile <ExternalLink size={14} />
            </a>
          </section>
          {stats && (
            <div className="stats-grid">
              <div>
                <TvMinimal size={18} />
                <b>{stats.num_items_watching}</b>
                <span>Watching</span>
              </div>
              <div>
                <CircleCheck size={18} />
                <b>{stats.num_items_completed}</b>
                <span>Completed</span>
              </div>
              <div>
                <Play size={18} />
                <b>{stats.num_episodes.toLocaleString()}</b>
                <span>Episodes</span>
              </div>
              <div>
                <Film size={18} />
                <b>{stats.num_days_watched.toFixed(1)}</b>
                <span>Days watched</span>
              </div>
            </div>
          )}
          <p className="helper centered">Statistics reflect your most recent sign-in.</p>
          <button
            disabled={!!busy}
            className="button danger wide"
            onClick={() =>
              void act(
                'logout',
                { type: 'LOGOUT' },
                'Disconnected. Your saved matches are still on this device.',
              )
            }
          >
            <LogOut size={16} /> Disconnect account
          </button>
        </>
      ) : (
        <section className="card empty-state">
          <div className="empty-icon">
            <UserRound size={30} />
          </div>
          <h2>Make yourself at home.</h2>
          <p>Connect your account to see your profile and keep your list up to date.</p>
          <button className="button primary wide" disabled={!!busy} onClick={() => void signIn()}>
            Connect MyAnimeList <ArrowRight size={16} />
          </button>
        </section>
      )}
    </>
  );
}
