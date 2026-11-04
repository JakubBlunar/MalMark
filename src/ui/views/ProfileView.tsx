import { useTranslation } from 'react-i18next';
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
import type { Profile } from '../../shared/types';
import { inExtension, request } from '../services/extension';

export function ProfileView({
  state,
  busy,
  act,
  signIn,
}: ViewProps & { signIn: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage;
  const [freshProfile, setFreshProfile] = useState<Profile>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!inExtension || !state.connected) return;
    let active = true;
    setLoading(true);
    setError('');
    setFreshProfile(undefined);
    void request<Profile>({ type: 'REFRESH_PROFILE' })
      .then((profile) => {
        if (active) setFreshProfile(profile);
      })
      .catch((error) => {
        if (active) setError((error as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [state.connected, state.profile?.id, attempt]);
  const profile = freshProfile?.id === state.profile?.id ? freshProfile : state.profile;
  const stats = profile?.anime_statistics;
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">{t('YOUR LITTLE ANIME CORNER')}</span>
        <h1>{t('Profile')}</h1>
        <p>{t('Your MyAnimeList account, at a glance.')}</p>
      </div>
      {profile ? (
        <>
          <section className="card profile-card">
            <div className="profile-avatar">
              {profile.picture ? <img src={profile.picture} alt="" /> : <UserRound size={32} />}
            </div>
            <h2>{profile.name}</h2>
            <span className="connected-label">
              <i /> {t('Connected to MyAnimeList')}
            </span>
            {profile.location && <p>{profile.location}</p>}
            {profile.joined_at && (
              <p className="helper">
                {t('Member since')}{' '}
                {new Date(profile.joined_at).toLocaleDateString(language, {
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            )}
            <a
              className="button secondary"
              href={`https://myanimelist.net/profile/${encodeURIComponent(profile.name)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('View MAL profile')} <ExternalLink size={14} />
            </a>
          </section>
          {stats && (
            <div className="stats-grid">
              <div>
                <TvMinimal size={18} />
                <b>{stats.num_items_watching}</b>
                <span>{t('Watching')}</span>
              </div>
              <div>
                <CircleCheck size={18} />
                <b>{stats.num_items_completed}</b>
                <span>{t('Completed')}</span>
              </div>
              <div>
                <Play size={18} />
                <b>{stats.num_episodes.toLocaleString(language)}</b>
                <span>{t('Episodes')}</span>
              </div>
              <div>
                <Film size={18} />
                <b>
                  {stats.num_days_watched.toLocaleString(language, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </b>
                <span>{t('Days watched')}</span>
              </div>
            </div>
          )}
          <div className="helper centered" aria-live="polite">
            {error ? (
              <>
                <p role="alert">
                  {t('Couldn’t refresh your profile. Showing saved statistics.')} {error}
                </p>
                <button
                  className="text-button"
                  onClick={() => setAttempt((attempt) => attempt + 1)}
                >
                  {t('Try again')}
                </button>
              </>
            ) : (
              <p>
                {loading
                  ? t('Refreshing statistics…')
                  : freshProfile
                    ? t('Statistics refreshed from MyAnimeList.')
                    : t('Statistics refresh when you open your profile.')}
              </p>
            )}
          </div>
          <button
            disabled={!!busy}
            className="button danger wide"
            onClick={() =>
              void act(
                'logout',
                { type: 'LOGOUT' },
                t('Disconnected. Your saved matches are still on this device.'),
              )
            }
          >
            <LogOut size={16} /> {t('Disconnect account')}
          </button>
        </>
      ) : (
        <section className="card empty-state">
          <div className="empty-icon">
            <UserRound size={30} />
          </div>
          <h2>{t('Make yourself at home.')}</h2>
          <p>{t('Connect your account to see your profile and keep your list up to date.')}</p>
          <button className="button primary wide" disabled={!!busy} onClick={() => void signIn()}>
            {t('Connect MyAnimeList')} <ArrowRight size={16} />
          </button>
        </section>
      )}
    </>
  );
}
import { useEffect, useState } from 'react';
