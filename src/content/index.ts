import browser from 'webextension-polyfill';
import { detect } from './detect';
import type { Message, PendingUpdate, Reply, SiteConfig } from '../shared/types';
import { siteForUrl } from '../shared/sites';
import { startPicker } from './picker';
import { createPlayerTracker } from './player';

declare global {
  interface Window {
    __malmarkController?: { stop: () => void };
  }
}
if (!window.__malmarkController) window.__malmarkController = start();
function start(): { stop: () => void } | undefined {
  let valid = true;
  async function sendReply<T>(message: Message): Promise<Reply<T> | undefined> {
    if (!valid) return;
    let timer: number | undefined;
    try {
      const reply = (await Promise.race([
        browser.runtime.sendMessage(message),
        new Promise((_, reject) => {
          timer = window.setTimeout(
            () => reject(new Error('Background response timed out.')),
            message.type === 'DETECTION' ? 45000 : 5000,
          );
        }),
      ])) as Reply<T>;
      return reply;
    } catch (error) {
      // Worker startup and a temporarily missing receiver are recoverable.
      if (
        /extension context invalidated/i.test(
          error instanceof Error ? error.message : String(error),
        )
      )
        stop();
    } finally {
      window.clearTimeout(timer);
    }
  }
  async function send<T>(message: Message): Promise<T | undefined> {
    const reply = await sendReply<T>(message);
    return reply?.ok ? reply.data : undefined;
  }
  const topPage = window === window.top;
  let customConfig: SiteConfig | undefined;
  let configReady = false;
  let configLoading = false;
  let scanPending = false;
  let detectionAcknowledgedAt = 0;
  let lastUrl = location.href;
  let routeChangedAt = Date.now();
  let lastDetection = '';
  let candidate = '';
  let candidateAt = 0;
  let host: HTMLDivElement | undefined;
  const hiddenPrompts = new Set<string>();

  function placePrompt(): void {
    if (!host) return;
    const fullscreen = document.fullscreenElement;
    // Native video and fullscreen iframes cannot render a sibling overlay. Keep the review queued.
    const hidden =
      (!topPage && !fullscreen) ||
      fullscreen instanceof HTMLVideoElement ||
      fullscreen instanceof HTMLIFrameElement;
    host.style.display = hidden ? 'none' : 'block';
    const parent = !hidden && fullscreen ? fullscreen : document.documentElement;
    if (host.parentElement !== parent) parent.append(host);
  }
  async function prompt(): Promise<void> {
    if (!topPage && !document.fullscreenElement) {
      host?.remove();
      host = undefined;
      return;
    }
    const state = await send<{
      pending: PendingUpdate[];
      showPrompts: boolean;
      newAnime?: { id: number; title: string };
    }>({ type: 'PROMPT_STATE' });
    const item = state?.pending.at(-1);
    const id = item?.id || (state?.newAnime ? `add:${state.newAnime.id}` : '');
    if (!state?.showPrompts || !id || hiddenPrompts.has(id)) {
      host?.remove();
      host = undefined;
      return;
    }
    if (host?.dataset.prompt === id) {
      placePrompt();
      return;
    }
    host?.remove();
    host = document.createElement('div');
    host.setAttribute('data-malmark-prompt', '');
    host.dataset.prompt = id;
    host.style.cssText = 'all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent =
      ':host{color-scheme:dark}.card{font:14px/1.5 system-ui,sans-serif;background:#181b24;color:#f3f3fa;border:1px solid #3d4256;border-radius:16px;padding:20px;width:min(320px,calc(100vw - 88px));box-shadow:0 12px 40px #0007}.tag{font-size:10px;letter-spacing:2px;color:#ac9fff;font-weight:700;margin-bottom:8px}strong{display:block;font-size:16px;margin-bottom:4px}p{color:#bbc0d0;margin:0 0 16px}button{font:600 13px system-ui;cursor:pointer;border:0;border-radius:8px;padding:10px 14px;background:#b4a4ff;color:#181326}button+button{background:transparent;color:#c0c4d2;margin-left:8px}button:focus-visible{outline:2px solid white;outline-offset:3px}';
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'status');
    const tag = document.createElement('div');
    tag.className = 'tag';
    tag.textContent = 'MALMARK';
    const title = document.createElement('strong');
    title.textContent = item
      ? `Episode ${item.episode} is ready to log`
      : 'A new anime for your list?';
    const description = document.createElement('p');
    description.textContent = item
      ? `${item.anime.title} · Update MAL from ${item.previous} to ${item.episode} episodes?`
      : `Add ${state.newAnime!.title} to Currently Watching on MyAnimeList?`;
    const review = document.createElement('button');
    review.textContent = item ? 'Review update' : 'Review anime';
    review.addEventListener('click', () => {
      void send({ type: 'OPEN_EXTENSION' });
    });
    const later = document.createElement('button');
    later.textContent = 'Later';
    later.addEventListener('click', () => {
      hiddenPrompts.add(id);
      host?.remove();
      host = undefined;
    });
    card.append(tag, title, description, review, later);
    shadow.append(style, card);
    placePrompt();
  }
  function origins(): string[] {
    return [
      ...new Set(
        [...document.querySelectorAll('iframe')].flatMap((frame) => {
          const box = frame.getBoundingClientRect();
          if (box.width < 200 || box.height < 120) return [];
          try {
            const u = new URL(frame.src, location.href);
            return u.protocol === 'https:' && u.origin !== location.origin ? [u.origin] : [];
          } catch {
            return [];
          }
        }),
      ),
    ];
  }
  async function scanPage(force = false): Promise<void> {
    if (!topPage || !valid || !configReady || (!siteForUrl(location.href) && !customConfig)) return;
    if (lastUrl !== location.href) {
      lastUrl = location.href;
      routeChangedAt = Date.now();
      lastDetection = '';
      candidate = '';
      host?.remove();
      host = undefined;
      await send({ type: 'DETECTION', detection: null, pageUrl: location.href, frameOrigins: [] });
      return;
    }
    if (Date.now() - routeChangedAt < 1500) return;
    const detection = detect(document, location.href, customConfig);
    const frameOrigins = origins();
    const signature = JSON.stringify({ detection, frameOrigins });
    if (signature !== candidate) {
      candidate = signature;
      candidateAt = Date.now();
      return;
    }
    if (Date.now() - candidateAt < 800) return;
    if (
      !scanPending &&
      (signature !== lastDetection || force || Date.now() - detectionAcknowledgedAt >= 10000)
    ) {
      scanPending = true;
      const pageUrl = location.href;
      try {
        const reply = await sendReply({ type: 'DETECTION', detection, pageUrl, frameOrigins });
        if (reply?.ok && pageUrl === location.href) {
          lastDetection = signature;
          detectionAcknowledgedAt = Date.now();
          players.scan(true);
          await prompt();
        }
      } finally {
        scanPending = false;
      }
    }
  }
  const players = createPlayerTracker((playback) => {
    if (!valid) return;
    if (topPage && (lastUrl !== location.href || !lastDetection)) return;
    void send({
      type: 'PLAYBACK',
      pageUrl: location.href,
      playback,
    });
  });
  const listener = (message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return false;
    if (message.type === 'PING_PLAYER') {
      if (valid) {
        players.scan(true);
        if (!configReady) void loadConfig();
        else void scanPage();
      }
      return Promise.resolve({ ready: valid });
    }
    if (message.type === 'REDETECT') {
      lastDetection = '';
      void scanPage(true);
      players.scan(true);
    }
    if (message.type === 'PROMPT_CHANGED') void prompt();
    if (message.type === 'SITE_CONFIG_CHANGED') {
      configReady = false;
      lastDetection = '';
      candidate = '';
      void loadConfig();
    }
    if (
      message.type === 'START_PICKER' &&
      topPage &&
      'nonce' in message &&
      typeof message.nonce === 'string'
    ) {
      const nonce = message.nonce;
      host?.remove();
      host = undefined;
      startPicker(async (titleSelector, episodeSelector) => {
        const response = (await browser.runtime.sendMessage({
          type: 'SAVE_SITE_CONFIG',
          nonce,
          titleSelector,
          episodeSelector,
        })) as Reply<SiteConfig>;
        if (!response.ok) throw new Error(response.error);
        customConfig = response.data;
        configReady = true;
        lastDetection = '';
        candidate = '';
        routeChangedAt = Date.now() - 2000;
        await scanPage(true);
      });
    }
    return false;
  };
  browser.runtime.onMessage.addListener(listener);
  const events = new AbortController();
  document.addEventListener('fullscreenchange', () => void prompt(), { signal: events.signal });
  window.addEventListener(
    'pageshow',
    () => {
      detectionAcknowledgedAt = 0;
      players.scan(true);
    },
    { signal: events.signal },
  );
  document.addEventListener('visibilitychange', () => players.scan(true), {
    signal: events.signal,
  });
  const timer = window.setInterval(() => {
    if (!configReady) void loadConfig();
    void scanPage();
    players.scan();
    placePrompt();
  }, 1200);
  async function loadConfig() {
    if (configLoading || !valid) return;
    configLoading = true;
    try {
      const reply = await sendReply<SiteConfig>({ type: 'GET_SITE_CONFIG' });
      if (reply?.ok) {
        customConfig = reply.data;
        configReady = true;
        void scanPage();
      }
    } finally {
      configLoading = false;
    }
  }
  function stop() {
    valid = false;
    clearInterval(timer);
    players.stop();
    events.abort();
    host?.remove();
    if (window.__malmarkController?.stop === stop) delete window.__malmarkController;
    try {
      browser.runtime.onMessage.removeListener(listener);
    } catch {
      /* invalidated extension */
    }
  }
  void loadConfig();
  players.scan();
  return valid ? { stop } : undefined;
}
