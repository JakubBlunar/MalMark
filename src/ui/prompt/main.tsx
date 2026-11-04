import { Trans, useTranslation } from 'react-i18next';
import { initializeI18n } from '../i18n';
import { i18n } from '../../shared/i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { GuidancePrompt, PendingUpdate } from '../../shared/types';
import { grantPromptPlayer, request } from '../services/extension';
import { progressListNote } from '../lib/display';
import './prompt.css';

function EpisodePrompt() {
  const { t } = useTranslation();
  const nonce = location.hash.slice(1);
  const [prompt, setPrompt] = useState<PendingUpdate | GuidancePrompt>();
  const guidance = prompt && 'kind' in prompt ? prompt : undefined;
  const item = prompt && !('kind' in prompt) ? prompt : undefined;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    let requestedHeight = 0;
    let sentHeight = 0;
    let sending = false;
    let active = true;
    const report = async () => {
      if (sending) return;
      sending = true;
      try {
        while (active && sentHeight !== requestedHeight) {
          sentHeight = requestedHeight;
          await request({ type: 'INLINE_PROMPT_SIZE', nonce, height: sentHeight }).catch(
            () => undefined,
          );
        }
      } finally {
        sending = false;
      }
    };
    const measure = () => {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (height <= 0 || height === requestedHeight) return;
      requestedHeight = height;
      void report();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [nonce]);
  useEffect(() => {
    void request<PendingUpdate | GuidancePrompt>({ type: 'GET_INLINE_PROMPT', nonce })
      .then(setPrompt)
      .catch((e) => setError(String(e.message || e)));
  }, [nonce]);
  async function act(action: 'approve' | 'later') {
    if (busy || !item) return;
    setBusy(true);
    setError('');
    try {
      await request({ type: 'INLINE_PROMPT_ACTION', nonce, action });
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Update failed. Try again or open Malmark.'));
      setBusy(false);
    }
  }
  async function guide(action: 'dismiss' | 'match' | 'player', origin?: string) {
    if (busy || !guidance) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'player' && origin) {
        // Keep the native permission request in this extension-frame click handler.
        await grantPromptPlayer(origin, nonce);
      } else {
        await request({ type: 'GUIDANCE_ACTION', nonce, action });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Open Malmark to continue.'));
      setBusy(false);
    }
  }
  return (
    <main
      ref={panel}
      aria-label={guidance ? t('Malmark watch setup') : t('Malmark episode reminder')}
    >
      <div className="brand">{'MALMARK'}</div>
      <h1>
        {item
          ? t('Episode {{episode}} is ready to log', { episode: item.episode })
          : guidance?.kind === 'player'
            ? t('Connect the video player')
            : guidance
              ? t('Find the right anime')
              : 'Malmark'}
      </h1>
      {guidance && (
        <>
          <p className="anime">{guidance.title}</p>
          <p>
            {guidance.kind === 'player'
              ? t('Allow the domain used by your video so Malmark can read playback time.')
              : t(
                  'Malmark couldn’t match this title on MyAnimeList. Choose the correct anime to start tracking.',
                )}
          </p>
          {guidance.kind === 'player' && (
            <div className="player-domains">
              {guidance.origins.map((origin) => (
                <div className="player-domain" key={origin}>
                  <span>{new URL(origin).hostname}</span>
                  <button
                    disabled={busy}
                    onClick={(e) => {
                      if (e.nativeEvent.isTrusted) void guide('player', origin);
                    }}
                  >
                    {t('Allow')}
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="actions">
            {guidance.kind === 'unmatched' && (
              <button
                disabled={busy}
                onClick={(e) => {
                  if (e.nativeEvent.isTrusted) void guide('match');
                }}
              >
                {t('Find match')}
              </button>
            )}
            <button
              className="later"
              disabled={busy}
              onClick={(e) => {
                if (e.nativeEvent.isTrusted) void guide('dismiss');
              }}
            >
              {t('Later')}
            </button>
          </div>
        </>
      )}
      {item && (
        <>
          <p className="anime">{item.anime.alternative_titles?.en || item.anime.title}</p>
          <p>
            <Trans
              i18nKey="Update MyAnimeList from <previous>{{previous}}</previous> to <episode>{{episode}}</episode> watched episodes?"
              values={{ previous: item.previous, episode: item.episode }}
              components={{ previous: <b />, episode: <b /> }}
            />
          </p>
          {progressListNote(item.anime) && <p>{progressListNote(item.anime)}</p>}
          {item.episode > item.previous + 1 && (
            <p className="warning">
              {t('This also marks episodes {{first}}–{{last}} as watched.', {
                first: item.previous + 1,
                last: item.episode - 1,
              })}
            </p>
          )}
          {item.error && <p className="warning">{item.error}</p>}
          <div className="actions">
            <button
              disabled={busy}
              onClick={(e) => {
                if (e.nativeEvent.isTrusted) void act('approve');
              }}
            >
              {busy ? t('Saving…') : t('Update progress')}
            </button>
            <button
              className="later"
              disabled={busy}
              onClick={(e) => {
                if (e.nativeEvent.isTrusted) void act('later');
              }}
            >
              {t('Later')}
            </button>
          </div>
          <small>{t('Later keeps this update in Malmark for you to confirm.')}</small>
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}
await initializeI18n();
const updateLanguage = () => {
  document.documentElement.lang = i18n.resolvedLanguage || 'en';
};
i18n.on('languageChanged', updateLanguage);
updateLanguage();
createRoot(document.getElementById('root')!).render(<EpisodePrompt />);
