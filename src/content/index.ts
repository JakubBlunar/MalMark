import browser from 'webextension-polyfill';
import { detect } from './detect';
import type {
  Message,
  PendingUpdate,
  Playback,
  ProgressNotice,
  Reply,
  SiteConfig,
} from '../shared/types';
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
  let activeScan: symbol | undefined;
  let detectionAcknowledgedAt = 0;
  let lastUrl = location.href;
  let parentUrl = '';
  let routeChangedAt = Date.now();
  let lastDetection = '';
  let candidate = '';
  let candidateAt = 0;
  let host: HTMLDivElement | undefined;
  let promptFrame: HTMLIFrameElement | undefined;
  let promptNonce = '';
  let promptHeight = 220;
  let noticeTimer: number | undefined;
  const hiddenPrompts = new Set<string>();

  function resizePrompt(): void {
    if (!promptFrame?.isConnected) return;
    const available = Math.max(1, (window.visualViewport?.height ?? window.innerHeight) - 48);
    promptFrame.style.height = `${Math.min(promptHeight, available)}px`;
  }
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
    resizePrompt();
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
      nonce?: string;
      notice?: ProgressNotice;
    }>({ type: 'PROMPT_STATE' });
    const item = state?.pending.at(-1);
    const notice = state?.notice && state.notice.expiresAt > Date.now() ? state.notice : undefined;
    const id = notice
      ? `notice:${notice.id}`
      : item
        ? `${item.id}:${state?.nonce ?? ''}`
        : state?.newAnime
          ? `add:${state.newAnime.id}`
          : '';
    if (!state || (!state.showPrompts && !notice) || !id || hiddenPrompts.has(id)) {
      host?.remove();
      host = undefined;
      return;
    }
    if (host?.dataset.prompt === id) {
      placePrompt();
      return;
    }
    window.clearTimeout(noticeTimer);
    host?.remove();
    host = document.createElement('div');
    host.setAttribute('data-malmark-prompt', '');
    host.dataset.prompt = id;
    host.style.cssText = 'all:initial;position:fixed;right:24px;bottom:24px;z-index:2147483647;';
    const shadow = host.attachShadow({ mode: 'closed' });
    if (notice) {
      host.setAttribute('data-malmark-notice', '');
      host.setAttribute('role', 'status');
      host.setAttribute('aria-live', 'polite');
      host.setAttribute('aria-label', `MyAnimeList updated. Episode ${notice.episode} saved.`);
      const style = document.createElement('style');
      style.textContent =
        '.notice{box-sizing:border-box;font:14px/1.5 system-ui,sans-serif;background:#181b24;color:#f3f3fa;border:1px solid #477563;border-radius:16px;padding:18px;width:min(360px,calc(100vw - 48px));box-shadow:0 12px 40px #0007}strong{display:block;color:#75dfb5;font-size:16px;margin-bottom:6px}p{margin:0;color:#c9ccda;overflow-wrap:anywhere}';
      const card = document.createElement('div');
      card.className = 'notice';
      const title = document.createElement('strong');
      title.textContent = 'Progress updated';
      const text = document.createElement('p');
      text.textContent = `${notice.title} · Episode ${notice.episode} saved on MyAnimeList.`;
      card.append(title, text);
      shadow.append(style, card);
      placePrompt();
      noticeTimer = window.setTimeout(
        () => {
          if (host?.dataset.prompt === id) {
            host.remove();
            host = undefined;
            void prompt();
          }
        },
        Math.max(0, Math.min(4000, notice.expiresAt - Date.now())),
      );
      return;
    }
    if (item && state.nonce) {
      const frame = document.createElement('iframe');
      frame.src = browser.runtime.getURL(`prompt.html#${state.nonce}`);
      frame.title = 'Malmark episode update';
      frame.referrerPolicy = 'no-referrer';
      frame.style.cssText =
        'border:0;display:block;width:min(360px,calc(100vw - 48px));height:220px;max-height:calc(100dvh - 48px);border-radius:16px;box-shadow:0 12px 40px #0007;';
      promptFrame = frame;
      promptNonce = state.nonce;
      promptHeight = 220;
      shadow.append(frame);
      placePrompt();
      return;
    }
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
      resetRoute();
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
      !activeScan &&
      (signature !== lastDetection || force || Date.now() - detectionAcknowledgedAt >= 10000)
    ) {
      const scan = Symbol();
      activeScan = scan;
      const pageUrl = location.href;
      try {
        const reply = await sendReply({ type: 'DETECTION', detection, pageUrl, frameOrigins });
        if (activeScan === scan && reply?.ok && pageUrl === location.href) {
          lastDetection = signature;
          detectionAcknowledgedAt = Date.now();
          players.scan(true);
          await prompt();
        }
      } finally {
        if (activeScan === scan) activeScan = undefined;
      }
    }
  }
  const reportPlayback = (playback: Playback) => {
    if (!valid) return;
    if (topPage && (lastUrl !== location.href || !lastDetection)) return;
    void send({
      type: 'PLAYBACK',
      pageUrl: location.href,
      playback,
    });
  };
  let players = createPlayerTracker(reportPlayback);
  function resetRoute() {
    lastUrl = location.href;
    routeChangedAt = Date.now();
    lastDetection = '';
    candidate = '';
    activeScan = undefined;
    host?.remove();
    host = undefined;
    players.stop();
    players = createPlayerTracker(reportPlayback);
  }
  const listener = (message: unknown, sender: browser.Runtime.MessageSender) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return false;
    if (
      message.type === 'INLINE_PROMPT_SIZE' &&
      sender?.id === browser.runtime.id &&
      !sender.tab &&
      'nonce' in message &&
      message.nonce === promptNonce &&
      'height' in message &&
      typeof message.height === 'number' &&
      Number.isFinite(message.height) &&
      message.height > 0
    ) {
      promptHeight = Math.ceil(message.height);
      resizePrompt();
    }
    if (message.type === 'ROUTE_CHANGED') {
      if (topPage) {
        if (lastUrl !== location.href) resetRoute();
        void scanPage();
      } else if (
        'pageUrl' in message &&
        typeof message.pageUrl === 'string' &&
        parentUrl !== message.pageUrl
      ) {
        parentUrl = message.pageUrl;
        players.stop();
        players = createPlayerTracker(reportPlayback);
        players.scan(true);
      }
    }
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
  window.addEventListener('resize', resizePrompt, { signal: events.signal });
  window.visualViewport?.addEventListener('resize', resizePrompt, { signal: events.signal });
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
    window.clearTimeout(noticeTimer);
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
