import browser from 'webextension-polyfill';
import { detect } from './detect';
import type { Message, PendingUpdate, Reply, SiteConfig } from '../shared/types';
import { siteForUrl } from '../shared/sites';
import { startPicker } from './picker';

declare global {
  interface Window {
    __malmarkLoaded?: boolean;
  }
}
if (!window.__malmarkLoaded) {
  window.__malmarkLoaded = true;
  start();
}
function start(): void {
  let valid = true;
  async function send<T>(message: Message): Promise<T | undefined> {
    if (!valid) return;
    try {
      const reply = (await browser.runtime.sendMessage(message)) as Reply<T>;
      return reply?.ok ? reply.data : undefined;
    } catch {
      valid = false;
    }
  }
  const topPage = window === window.top;
  let customConfig: SiteConfig | undefined;
  let configReady = false;
  const ids = new WeakMap<HTMLVideoElement, string>();
  const bound = new WeakSet<HTMLVideoElement>();
  let selected: HTMLVideoElement | undefined;
  let lastSample = 0;
  let lastVideoId = '';
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
      lastSample = 0;
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
    if (signature !== lastDetection || force) {
      lastDetection = signature;
      await send({ type: 'DETECTION', detection, pageUrl: location.href, frameOrigins });
      await prompt();
    }
  }
  function sample(video: HTMLVideoElement, urgent = false): void {
    if (!valid || !Number.isFinite(video.duration) || video.duration < 60) return;
    // Avoid short ad clips and hidden preload videos; prefer the visible, playing video.
    const box = video.getBoundingClientRect();
    if (box.width < 180 || box.height < 100) return;
    if (
      selected &&
      selected !== video &&
      !selected.paused &&
      !selected.ended &&
      selected.isConnected
    )
      return;
    selected = video;
    const id = ids.get(video)!;
    if (!urgent && id === lastVideoId && Date.now() - lastSample < 4000) return;
    lastSample = Date.now();
    lastVideoId = id;
    if (topPage && (lastUrl !== location.href || !lastDetection)) return;
    void send({
      type: 'PLAYBACK',
      pageUrl: location.href,
      playback: {
        videoId: id,
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        ended: video.ended,
        rate: video.playbackRate,
        sentAt: Date.now(),
      },
    });
  }
  function scanVideos(): void {
    for (const video of document.querySelectorAll('video')) {
      if (!bound.has(video)) {
        bound.add(video);
        ids.set(video, crypto.randomUUID());
        for (const event of [
          'play',
          'pause',
          'ended',
          'seeked',
          'ratechange',
          'loadedmetadata',
          'emptied',
        ])
          video.addEventListener(event, () => {
            if (event === 'emptied') ids.set(video, crypto.randomUUID());
            sample(video, true);
          });
        video.addEventListener('timeupdate', () => sample(video));
      }
      if (!video.paused) sample(video);
    }
    // Some players use an open shadow root.
    for (const el of document.querySelectorAll('cr-video, crunchyroll-player, media-player')) {
      const video = el.shadowRoot?.querySelector('video');
      if (video && !bound.has(video)) {
        bound.add(video);
        ids.set(video, crypto.randomUUID());
        video.addEventListener('timeupdate', () => sample(video));
        video.addEventListener('ended', () => sample(video, true));
      }
    }
  }
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (!message || typeof message !== 'object' || !('type' in message)) return false;
    if (message.type === 'REDETECT') {
      lastDetection = '';
      void scanPage(true);
    }
    if (message.type === 'PROMPT_CHANGED') void prompt();
    if (message.type === 'SITE_CONFIG_CHANGED')
      void send<SiteConfig>({ type: 'GET_SITE_CONFIG' }).then((config) => {
        customConfig = config;
        lastDetection = '';
        candidate = '';
      });
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
  });
  document.addEventListener('fullscreenchange', () => void prompt());
  const timer = window.setInterval(() => {
    if (!valid) {
      clearInterval(timer);
      host?.remove();
      return;
    }
    void scanPage();
    scanVideos();
    placePrompt();
  }, 1200);
  void send<SiteConfig>({ type: 'GET_SITE_CONFIG' }).then((config) => {
    customConfig = config;
    configReady = true;
    void scanPage();
  });
  scanVideos();
}
