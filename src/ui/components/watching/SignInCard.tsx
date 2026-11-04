import { useLanguagePreference } from '../../i18n';
import { ArrowRight, CheckCheck, Play, Radio } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PublicState, WatchSession } from '../../../shared/types';
import type { Act } from '../../types';
import { OAuthSetupForm } from '../auth/OAuthSetupForm';
import { Spinner } from '../shared/Spinner';
import { LanguagePicker } from '../settings/LanguagePicker';

export function SignInCard({
  session: s,
  busy,
  signIn,
  oauth,
  redirectUrl,
  act,
}: {
  session?: WatchSession;
  busy: string;
  signIn: () => Promise<void>;
  oauth: PublicState['oauth'];
  redirectUrl: string;
  act: Act;
}) {
  const { t, hasPreference } = useLanguagePreference();
  const [editing, setEditing] = useState(false);
  const card = useRef<HTMLElement>(null);
  const previouslyChosen = useRef(hasPreference);
  useEffect(() => {
    if (!previouslyChosen.current && hasPreference)
      card.current?.querySelector<HTMLElement>('input, .sign-in-actions button')?.focus();
    previouslyChosen.current = hasPreference;
  }, [hasPreference]);
  const setup = oauth.mode === 'unpacked' && (!oauth.clientId || editing);
  return (
    <>
      {!hasPreference && (
        <section className="card welcome-language">
          <LanguagePicker welcome />
        </section>
      )}
      <section className="onboarding card" ref={card}>
        {!setup && (
          <div className="onboarding-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="art-star star-one">✧</span>
            <span className="art-star star-two">✦</span>
            <span className="art-play">
              <Play size={30} fill="currentColor" />
            </span>
            <span className="art-check">
              <CheckCheck size={22} />
            </span>
            <span className="art-label">{t('ONE MORE EPISODE.')}</span>
          </div>
        )}
        <span className="eyebrow accent">{t('LESS ADMIN. MORE ANIME.')}</span>
        <h1>
          {t('Keep watching.')}
          <br />
          {t('We’ll keep your place.')}
        </h1>
        <p>
          {setup
            ? t(
                'This GitHub build needs your own MyAnimeList app. Set it up once, then connect your account.',
              )
            : t(
                'Connect MyAnimeList, play an episode, and confirm your progress when you’re done.',
              )}
        </p>
        {s && (
          <div className="detected-line">
            <Radio size={15} />
            <span>
              {t('Detected:')} <b>{s.detection.title}</b>
            </span>
          </div>
        )}
        {setup ? (
          <>
            {hasPreference && <LanguagePicker compact />}
            <OAuthSetupForm
              key={oauth.clientId}
              clientId={oauth.clientId}
              redirectUrl={redirectUrl}
              busy={busy}
              act={act}
              onSaved={() => setEditing(false)}
              onCancel={oauth.clientId ? () => setEditing(false) : undefined}
            />
          </>
        ) : (
          <>
            <div className="sign-in-actions">
              <button
                className="button primary wide"
                disabled={!!busy}
                aria-busy={busy === 'connect'}
                onClick={() => void signIn()}
              >
                {busy === 'connect' ? <Spinner /> : <ArrowRight size={17} />}
                {busy === 'connect' ? t('Connecting…') : t('Connect MyAnimeList')}
              </button>
              {hasPreference && <LanguagePicker compact />}
            </div>
            <p className="helper sign-in-note">
              {t('Sign in on MyAnimeList and approve access to your own list.')}
            </p>
            {oauth.mode === 'unpacked' && (
              <button className="text-button" disabled={!!busy} onClick={() => setEditing(true)}>
                {t('Edit API setup')}
              </button>
            )}
          </>
        )}
        <div className="works-with">
          <span>{t('Works with')}</span>
          <b className="cr-mark">◔</b> {'Crunchyroll'}
          <span className="separator">+</span>
          {t('websites you add')}
        </div>
      </section>
    </>
  );
}
