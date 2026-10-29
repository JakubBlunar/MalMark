import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { PendingUpdate } from '../../shared/types';
import { request } from '../services/extension';
import './prompt.css';

function EpisodePrompt() {
  const nonce = location.hash.slice(1);
  const [item, setItem] = useState<PendingUpdate>();
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
    void request<PendingUpdate>({ type: 'GET_INLINE_PROMPT', nonce })
      .then(setItem)
      .catch((e) => setError(String(e.message || e)));
  }, [nonce]);
  async function act(action: 'approve' | 'later') {
    if (busy || !item) return;
    setBusy(true);
    setError('');
    try {
      await request({ type: 'INLINE_PROMPT_ACTION', nonce, action });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed. Try again or open Malmark.');
      setBusy(false);
    }
  }
  return (
    <main ref={panel} aria-label="Malmark episode reminder">
      <div className="brand">MALMARK</div>
      <h1>{item ? `Episode ${item.episode} is ready to log` : 'Episode update'}</h1>
      {item && (
        <>
          <p className="anime">{item.anime.alternative_titles?.en || item.anime.title}</p>
          <p>
            Update MyAnimeList from <b>{item.previous}</b> to <b>{item.episode}</b> watched
            episodes?
          </p>
          {item.episode > item.previous + 1 && (
            <p className="warning">
              This also marks episodes {item.previous + 1}–{item.episode - 1} as watched.
            </p>
          )}
          <div className="actions">
            <button
              disabled={busy}
              onClick={(e) => {
                if (e.nativeEvent.isTrusted) void act('approve');
              }}
            >
              {busy ? 'Saving…' : 'Update progress'}
            </button>
            <button
              className="later"
              disabled={busy}
              onClick={(e) => {
                if (e.nativeEvent.isTrusted) void act('later');
              }}
            >
              Later
            </button>
          </div>
          <small>Later keeps this update in Malmark for you to confirm.</small>
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
createRoot(document.getElementById('root')!).render(<EpisodePrompt />);
