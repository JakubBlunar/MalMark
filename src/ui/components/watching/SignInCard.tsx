import { ArrowRight, CheckCheck, Play, Radio } from 'lucide-react';
import { useState } from 'react';
import type { PublicState, WatchSession } from '../../../shared/types';
import type { Act } from '../../types';
import { OAuthSetupForm } from '../auth/OAuthSetupForm';
import { Spinner } from '../shared/Spinner';

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
  const [editing, setEditing] = useState(false);
  const setup = oauth.mode === 'unpacked' && (!oauth.clientId || editing);
  return (
    <section className="onboarding card">
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
          <span className="art-label">ONE MORE EPISODE.</span>
        </div>
      )}
      <span className="eyebrow accent">LESS ADMIN. MORE ANIME.</span>
      <h1>
        Keep watching.
        <br />
        We’ll keep your place.
      </h1>
      <p>
        {setup
          ? 'This GitHub build needs your own MyAnimeList app. Set it up once, then connect your account.'
          : 'Connect MyAnimeList, play an episode, and confirm your progress when you’re done.'}
      </p>
      {s && (
        <div className="detected-line">
          <Radio size={15} />
          <span>
            Detected: <b>{s.detection.title}</b>
          </span>
        </div>
      )}
      {setup ? (
        <OAuthSetupForm
          key={oauth.clientId}
          clientId={oauth.clientId}
          redirectUrl={redirectUrl}
          busy={busy}
          act={act}
          onSaved={() => setEditing(false)}
          onCancel={oauth.clientId ? () => setEditing(false) : undefined}
        />
      ) : (
        <>
          <button
            className="button primary wide"
            disabled={!!busy}
            aria-busy={busy === 'connect'}
            onClick={() => void signIn()}
          >
            {busy === 'connect' ? <Spinner /> : <ArrowRight size={17} />}
            {busy === 'connect' ? 'Connecting…' : 'Connect MyAnimeList'}
          </button>
          <p className="helper sign-in-note">
            Sign in on MyAnimeList and approve access to your own list.
          </p>
          {oauth.mode === 'unpacked' && (
            <button className="text-button" disabled={!!busy} onClick={() => setEditing(true)}>
              Edit API setup
            </button>
          )}
        </>
      )}
      <div className="works-with">
        <span>Works with</span>
        <b className="cr-mark">◔</b> Crunchyroll
        <span className="separator">+</span>
        websites you add
      </div>
    </section>
  );
}
