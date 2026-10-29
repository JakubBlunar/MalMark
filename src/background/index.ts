import browser from 'webextension-polyfill';
import type {
  Anime,
  Detection,
  Message,
  PendingUpdate,
  Playback,
  PublicState,
  WatchSession,
} from '../shared/types';
import { findMapping, positiveInteger, prefixMatches, siteForUrl } from '../shared/sites';
import { automaticMatch, titleForSeason } from '../shared/matching';
import { accumulate, emptyProgress, isComplete } from '../shared/progress';
import { cancelLogin, connect, getAnime, searchAnime, updateAnime } from './mal';
import { progressUpdateValues } from '../shared/list-status';
import {
  getAuth,
  getLoginClientId,
  getMappings,
  getPending,
  getSession,
  getSettings,
  getSites,
  serialized,
  setSession,
} from './storage';
import { configForUrl, registerSite, retireLegacyAccess, supportedUrl } from './sites';
import { chromiumSidePanel } from '../shared/sidebar';
import { OAUTH_SETUP_REQUIRED } from '../shared/config';
import { inlinePromptContext, inlinePromptNonce } from './inline-prompts';
import { automaticProgress } from './automatic-progress';
import { getProgressNotice, showProgressNotice } from './progress-notices';
import {
  discardWatchProgress,
  pruneWatchHistory,
  removeSiteProgress,
  resetAnimeProgress,
  restoreWatchProgress,
  saveWatchProgress,
} from './watch-history';

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    x.hash = '';
    y.hash = '';
    return x.href === y.href;
  } catch {
    return false;
  }
}

async function badge(tabId: number, session?: WatchSession): Promise<void> {
  const pending = (await getPending()).some((p) => p.tabId === tabId);
  const matched = session?.match === 'matched';
  const connected = !!session?.progress.last && Date.now() - session.progress.last.sentAt < 15000;
  const text = pending ? '!' : matched ? (connected ? '✓' : '…') : session ? '?' : '';
  await Promise.all([
    browser.action.setBadgeText({ tabId, text }),
    browser.action.setBadgeBackgroundColor({
      tabId,
      color: pending || (matched && !connected) ? '#efb75e' : matched ? '#75dfb5' : '#8d83f3',
    }),
    browser.action.setTitle({
      tabId,
      title: pending
        ? 'Malmark · Confirm episode update'
        : session?.anime
          ? `Malmark · ${session.anime.title} · ${connected ? 'Player connected' : 'Waiting for player'}`
          : 'Malmark · Find your anime',
    }),
  ]).catch(() => undefined);
}

async function resolve(
  d: Detection,
  previous?: WatchSession,
  refreshMatch = false,
): Promise<WatchSession> {
  const sameSeries = previous?.detection.seriesKey === d.seriesKey;
  const sameEpisode =
    sameSeries &&
    previous?.detection.episode === d.episode &&
    samePage(previous.detection.url, d.url);
  const session: WatchSession = {
    detection: d,
    match: 'unmatched',
    episode: d.episode,
    episodeOverride: sameEpisode ? previous.episodeOverride : undefined,
    progress: sameEpisode ? previous.progress : emptyProgress(),
    frameOrigins: previous?.frameOrigins ?? [],
    playerConnected: sameEpisode ? previous.playerConnected : false,
    updatedAt: Date.now(),
  };
  if (!(await getAuth())) {
    session.match = 'signed-out';
    return session;
  }
  try {
    const mapping = findMapping(await getMappings(), d);
    if (mapping) {
      session.anime = await getAnime(mapping.animeId);
      session.matchSource = 'manual';
      session.episode =
        d.episode === null
          ? sameEpisode
            ? previous.episode
            : null
          : positiveInteger(d.episode + mapping.episodeOffset);
    } else if (sameSeries && previous?.anime && previous.matchSource === 'automatic') {
      session.anime =
        previous.anime.status && !refreshMatch ? previous.anime : await getAnime(previous.anime.id);
      session.matchSource = 'automatic';
    } else {
      const title = titleForSeason(d.title, d.season);
      const match = automaticMatch(title, await searchAnime(title));
      if (match) {
        session.anime = await getAnime(match.id);
        session.matchSource = 'automatic';
      }
    }
    if (session.episodeOverride) session.episode = session.episodeOverride;
    session.match = session.anime ? 'matched' : 'unmatched';
    if (
      !sameEpisode ||
      previous?.anime?.id !== session.anime?.id ||
      previous?.episode !== session.episode
    ) {
      session.progress = await restoreWatchProgress(session);
      session.playerConnected = false;
    }
  } catch (e) {
    session.error = errorText(e);
  }
  return session;
}

async function detectMessage(
  message: Extract<Message, { type: 'DETECTION' }>,
  sender: browser.Runtime.MessageSender,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId !== 0) return;
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !(await supportedUrl(tab.url)) || !samePage(tab.url, message.pageUrl)) return;
  const d = message.detection;
  if (!d) {
    const previous = await getSession(tabId);
    if (previous) await completed(tabId, previous);
    await browser.storage.session.remove(`tab:${tabId}`);
    await badge(tabId);
    return;
  }
  if (
    d.site !== ((await configForUrl(tab.url)) ? 'custom' : siteForUrl(tab.url)) ||
    !samePage(d.url, tab.url) ||
    typeof d.title !== 'string' ||
    !d.title ||
    d.title.length > 200 ||
    typeof d.seriesKey !== 'string' ||
    d.seriesKey.length > 500 ||
    (d.episode !== null && !positiveInteger(d.episode)) ||
    (d.season !== null && !positiveInteger(d.season))
  )
    return;
  const previous = await getSession(tabId);
  const changed = !previous || JSON.stringify(previous.detection) !== JSON.stringify(d);
  if (changed && previous) await completed(tabId, previous);
  const session = changed ? await resolve(d, previous) : previous;
  // A MAL lookup can finish after autoplay has already changed the watch URL.
  const currentTab = await browser.tabs.get(tabId);
  if (!currentTab.url || !samePage(currentTab.url, message.pageUrl)) return;
  session.frameOrigins = Array.isArray(message.frameOrigins)
    ? message.frameOrigins
        .filter((o) => {
          try {
            return new URL(o).protocol === 'https:' && new URL(o).origin === o;
          } catch {
            return false;
          }
        })
        .slice(0, 12)
    : [];
  await setSession(tabId, session);
  await badge(tabId, session);
  await injectPlayers(tabId);
}

async function completed(tabId: number, session: WatchSession): Promise<void> {
  if (!session.anime || !session.episode || session.anime.my_list_status?.is_rewatching) return;
  const settings = await getSettings();
  if (!isComplete(session.progress, settings)) return;
  let anime = session.anime;
  if (anime.num_episodes && session.episode > anime.num_episodes) return;
  if (session.episode <= (anime.my_list_status?.num_episodes_watched ?? 0)) return;
  const auth = await getAuth();
  if (!auth) return;
  const key = `${auth.profile?.id}:${anime.id}:${session.episode}`;
  const pending = await getPending();
  const { resolved = {} } = (await browser.storage.local.get('resolved')) as {
    resolved?: Record<string, number>;
  };
  if (resolved[key] > Date.now() - 7 * 86400000 || pending.some((p) => p.id === key)) return;
  const result = await automaticProgress(anime, session.episode, session.progress, settings);
  if (result.anime !== anime) {
    anime = result.anime;
    session.anime = anime;
    await refreshAnimeSessions(anime);
  }
  const item: PendingUpdate = {
    id: key,
    anime,
    episode: session.episode,
    previous: anime.my_list_status?.num_episodes_watched ?? 0,
    tabId,
    createdAt: Date.now(),
    ...(result.error ? { error: result.error } : {}),
  };
  if (result.kind !== 'manual') {
    if (result.kind === 'updated')
      await showProgressNotice(
        tabId,
        key,
        anime.alternative_titles?.en || anime.title,
        session.episode,
      );
    await resolvePending(item);
    return;
  }
  if (anime.my_list_status?.is_rewatching) {
    await browser.tabs.sendMessage(tabId, { type: 'PROMPT_CHANGED' }).catch(() => undefined);
    return;
  }
  if (anime.num_episodes && session.episode > anime.num_episodes) return;
  pending.push(item);
  await browser.storage.local.set({ pending: pending.slice(-50) });
  await badge(tabId, session);
  await browser.tabs.sendMessage(tabId, { type: 'PROMPT_CHANGED' }).catch(() => undefined);
}

async function playbackMessage(
  message: Extract<Message, { type: 'PLAYBACK' }>,
  sender: browser.Runtime.MessageSender,
): Promise<void> {
  const tabId = sender.tab?.id;
  if (tabId === undefined || sender.frameId === undefined) return;
  const session = await getSession(tabId);
  const tab = await browser.tabs.get(tabId);
  if (
    !session ||
    !tab.url ||
    !samePage(session.detection.url, tab.url) ||
    !(await supportedUrl(tab.url))
  )
    return;
  if (!sender.url) return;
  if (!samePage(sender.url, message.pageUrl)) {
    // Chrome can retain a content script's original sender URL after pushState/replaceState.
    // Confirm the live frame and document instead of discarding its new playback samples.
    let origin: string;
    try {
      origin = new URL(message.pageUrl).origin;
      if (origin !== new URL(sender.url).origin) return;
    } catch {
      return;
    }
    if (!(await browser.permissions.contains({ origins: [origin + '/*'] }))) return;
    const frame = await browser.webNavigation
      .getFrame({ tabId, frameId: sender.frameId })
      .catch(() => null);
    if (
      !frame ||
      !samePage(frame.url, message.pageUrl) ||
      (sender.documentId && frame.documentId && sender.documentId !== frame.documentId)
    )
      return;
  }
  const p = message.playback;
  if (
    !p ||
    typeof p.videoId !== 'string' ||
    p.videoId.length > 100 ||
    typeof p.paused !== 'boolean' ||
    typeof p.ended !== 'boolean'
  )
    return;
  const progress = accumulate(session.progress, { ...p, sentAt: Date.now() }, sender.frameId);
  if (progress === session.progress) return;
  session.progress = progress;
  session.playerConnected = true;
  session.updatedAt = Date.now();
  await saveWatchProgress(session);
  await setSession(tabId, session);
  await completed(tabId, session);
  await badge(tabId, session);
}

const recovery = new Map<number, { attemptedAt: number; task?: Promise<void> }>();
function recoverPlayer(tabId: number): Promise<void> {
  const previous = recovery.get(tabId);
  if (previous?.task) return previous.task;
  if (previous && Date.now() - previous.attemptedAt < 5000) return Promise.resolve();
  const entry: { attemptedAt: number; task?: Promise<void> } = { attemptedAt: Date.now() };
  recovery.set(tabId, entry);
  entry.task = injectPlayers(tabId)
    .catch(() => undefined)
    .finally(() => {
      entry.task = undefined;
    });
  return entry.task;
}

async function bounded<T>(task: Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), 1500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function injectPlayers(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !(await supportedUrl(tab.url))) return;
  const frames = await browser.webNavigation.getAllFrames({ tabId });
  await Promise.allSettled(
    [{ frameId: 0, url: tab.url }, ...(frames ?? []).filter((f) => f.frameId !== 0)].map(
      async (frame) => {
        let origin: string;
        try {
          const u = new URL(frame.url);
          if (u.protocol !== 'https:') return;
          origin = u.origin;
        } catch {
          return;
        }
        if (await browser.permissions.contains({ origins: [origin + '/*'] })) {
          const health = (await bounded(
            browser.tabs
              .sendMessage(tabId, { type: 'PING_PLAYER' }, { frameId: frame.frameId })
              .catch(() => undefined),
          )) as { ready?: boolean } | undefined;
          if (health?.ready) return;
          await bounded(
            browser.scripting.executeScript({
              target: { tabId, frameIds: [frame.frameId] },
              files: ['content.js'],
            }),
          );
        }
      },
    ),
  );
}

async function snapshot(tabId?: number): Promise<PublicState> {
  const [settings, auth, pending, mappings, permissions, sites, clientId] = await Promise.all([
    getSettings(),
    getAuth(),
    getPending(),
    getMappings(),
    browser.permissions.getAll(),
    getSites(),
    getLoginClientId(),
  ]);
  const tab =
    tabId === undefined ? undefined : await browser.tabs.get(tabId).catch(() => undefined);
  const session =
    tabId !== undefined && tab?.url && (await supportedUrl(tab.url))
      ? await getSession(tabId)
      : undefined;
  if (tabId !== undefined && tab?.url && (await supportedUrl(tab.url))) {
    void recoverPlayer(tabId);
    await badge(tabId, session);
  }
  if (session)
    session.playerConnected =
      !!session.progress.last && Date.now() - session.progress.last.sentAt < 15000;
  return {
    settings,
    oauth: { mode: OAUTH_SETUP_REQUIRED ? 'unpacked' : 'store', clientId },
    profile: auth?.profile,
    connected: !!auth,
    redirectUrl: browser.identity.getRedirectURL(),
    tabId,
    session,
    pending: auth ? pending : [],
    mappings,
    playerPermissions: (permissions.origins ?? []).filter(
      (o) =>
        o.startsWith('https:') &&
        !siteForUrl(o) &&
        !['myanimelist.net', 'api.myanimelist.net'].includes(new URL(o).hostname) &&
        !sites.some((s) => s.origin + '/*' === o),
    ),
    sites,
    tabUrl: tab?.url,
  };
}

async function recheck(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !(await supportedUrl(tab.url))) {
    await browser.storage.session.remove(`tab:${tabId}`);
    await badge(tabId);
    return;
  }
  const previous = await getSession(tabId);
  if (previous) {
    const session = await resolve(previous.detection, previous, true);
    if (session.anime?.id !== previous.anime?.id || session.episode !== previous.episode)
      session.progress = emptyProgress();
    await setSession(tabId, session);
    await badge(tabId, session);
  }
  await browser.tabs
    .sendMessage(tabId, { type: 'REDETECT' }, { frameId: 0 })
    .catch(() => undefined);
  await injectPlayers(tabId);
}

async function resolvePending(item: PendingUpdate): Promise<void> {
  const { resolved = {} } = (await browser.storage.local.get('resolved')) as {
    resolved?: Record<string, number>;
  };
  const recent = Object.fromEntries(
    Object.entries(resolved).filter(([, date]) => Number(date) > Date.now() - 7 * 86400000),
  );
  await browser.storage.local.set({
    pending: (await getPending()).filter((p) => p.id !== item.id),
    resolved: { ...recent, [item.id]: Date.now() },
  });
  await badge(item.tabId, await getSession(item.tabId));
  await browser.tabs.sendMessage(item.tabId, { type: 'PROMPT_CHANGED' }).catch(() => undefined);
}

async function refreshAnimeSessions(anime: Anime): Promise<void> {
  const entries = await browser.storage.session.get(null);
  for (const [key, value] of Object.entries(entries)) {
    const session = value as WatchSession;
    if (key.startsWith('tab:') && session.anime?.id === anime.id)
      await browser.storage.session.set({ [key]: { ...session, anime } });
  }
}

async function resetEpisodeTracking(animeId: number, watched: number): Promise<void> {
  const account = (await getAuth())?.profile?.id;
  const prefix = `${account}:${animeId}:`;
  const { resolved = {} } = (await browser.storage.local.get('resolved')) as {
    resolved?: Record<string, number>;
  };
  await resetAnimeProgress(animeId, watched);
  await browser.storage.local.set({
    pending: (await getPending()).filter((item) => item.anime.id !== animeId),
    resolved: Object.fromEntries(
      Object.entries(resolved).filter(
        ([key]) => !key.startsWith(prefix) || Number(key.slice(prefix.length)) <= watched,
      ),
    ),
  });
  for (const [key, value] of Object.entries(await browser.storage.session.get(null))) {
    const session = value as WatchSession;
    if (!key.startsWith('tab:') || session.anime?.id !== animeId) continue;
    const tabId = Number(key.slice(4));
    if (session.episode && session.episode > watched)
      await setSession(tabId, { ...session, progress: emptyProgress() });
    await browser.storage.session.remove(`notice:${tabId}`);
    await badge(tabId, await getSession(tabId));
    await browser.tabs.sendMessage(tabId, { type: 'PROMPT_CHANGED' }).catch(() => undefined);
  }
}

async function uiMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'GET_STATE':
      return snapshot(message.tabId);
    case 'SAVE_OAUTH_CLIENT': {
      if (!OAUTH_SETUP_REQUIRED) throw new Error('This build uses its bundled MyAnimeList app.');
      if (await getAuth()) throw new Error('Log out before changing your MyAnimeList app.');
      if (
        typeof message.clientId !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,128}$/.test(message.clientId.trim())
      )
        throw new Error('Paste the client ID from your MyAnimeList app, without a URL or spaces.');
      cancelLogin();
      await browser.storage.local.set({ oauthClientId: message.clientId.trim() });
      return;
    }
    case 'SAVE_SETTINGS': {
      const s = message.settings;
      if (
        !s ||
        !Number.isInteger(s.threshold) ||
        s.threshold < 50 ||
        s.threshold > 100 ||
        !Number.isInteger(s.minWatchSeconds) ||
        s.minWatchSeconds < 30 ||
        s.minWatchSeconds > 600 ||
        typeof s.showPrompts !== 'boolean' ||
        typeof s.promptAtEnd !== 'boolean' ||
        (s.autoProgress !== undefined && typeof s.autoProgress !== 'boolean')
      )
        throw new Error(
          'Check the settings. Completion must be 50–100%, with 30–600 minimum seconds.',
        );
      await browser.storage.local.set({
        settings: {
          autoProgress: s.autoProgress ?? false,
          threshold: s.threshold,
          minWatchSeconds: s.minWatchSeconds,
          showPrompts: s.showPrompts,
          promptAtEnd: s.promptAtEnd,
        },
      });
      const entries = await browser.storage.session.get(null);
      for (const [key, value] of Object.entries(entries))
        if (key.startsWith('tab:')) await completed(Number(key.slice(4)), value as WatchSession);
      return;
    }
    case 'LOGOUT': {
      cancelLogin();
      await browser.storage.local.remove(['auth', 'pending', 'resolved', 'watchHistory']);
      await browser.storage.session.clear();
      for (const tab of await browser.tabs.query({}))
        if (tab.id !== undefined && tab.url && (await supportedUrl(tab.url))) await badge(tab.id);
      return;
    }
    case 'SEARCH':
      return searchAnime(message.query);
    case 'SAVE_MAPPING': {
      const session = await getSession(message.tabId);
      if (!session) throw new Error('Open a supported watch page first.');
      if (
        !positiveInteger(message.animeId) ||
        !Number.isInteger(message.episodeOffset) ||
        Math.abs(message.episodeOffset) > 10000 ||
        !prefixMatches(message.prefix, session.detection.url) ||
        new URL(message.prefix).username ||
        new URL(message.prefix).password
      )
        throw new Error(
          'Use a URL prefix on the current streaming site and a whole-number episode offset.',
        );
      const anime = await getAnime(message.animeId);
      const rules = await getMappings();
      const previousRule = findMapping(rules, session.detection);
      const mapping = {
        id: crypto.randomUUID(),
        prefix: message.prefix,
        seriesKey: session.detection.seriesKey,
        season: session.detection.season,
        animeId: anime.id,
        animeTitle: anime.title,
        episodeOffset: message.episodeOffset,
        createdAt: Date.now(),
      };
      await browser.storage.local.set({
        mappings: [
          ...rules.filter(
            (m) =>
              !(m.prefix === mapping.prefix && m.seriesKey === mapping.seriesKey) &&
              !(m.id === previousRule?.id && m.seriesKey !== mapping.seriesKey),
          ),
          mapping,
        ],
      });
      // A changed anime mapping invalidates playback credit and queued suggestions for this page.
      await discardWatchProgress(session);
      const fresh = await resolve(session.detection);
      await discardWatchProgress(fresh);
      fresh.progress = emptyProgress();
      fresh.frameOrigins = session.frameOrigins;
      await setSession(message.tabId, fresh);
      await browser.storage.local.set({
        pending: (await getPending()).filter(
          (p) =>
            p.tabId !== message.tabId ||
            p.anime.id !== session.anime?.id ||
            p.episode !== session.episode,
        ),
      });
      await badge(message.tabId, fresh);
      await injectPlayers(message.tabId).catch(() => undefined);
      return;
    }
    case 'REMOVE_MAPPING': {
      await browser.storage.local.set({
        mappings: (await getMappings()).filter((m) => m.id !== message.id),
      });
      for (const tab of await browser.tabs.query({}))
        if (tab.id !== undefined && tab.url && (await supportedUrl(tab.url))) await recheck(tab.id);
      return;
    }
    case 'SET_EPISODE': {
      const session = await getSession(message.tabId);
      if (
        !session ||
        !positiveInteger(message.episode) ||
        (session.anime?.num_episodes && message.episode > session.anime.num_episodes)
      )
        throw new Error('Enter a valid MAL episode number.');
      const previousEpisode = session.episode;
      await discardWatchProgress(session);
      session.episode = message.episode;
      session.episodeOverride = message.episode;
      session.progress = emptyProgress();
      await discardWatchProgress(session);
      await browser.storage.local.set({
        pending: (await getPending()).filter(
          (p) =>
            p.tabId !== message.tabId ||
            p.anime.id !== session.anime?.id ||
            p.episode !== previousEpisode,
        ),
      });
      await setSession(message.tabId, session);
      await badge(message.tabId, session);
      await injectPlayers(message.tabId).catch(() => undefined);
      return;
    }
    case 'ADD_WATCHING': {
      const session = await getSession(message.tabId);
      if (!session?.anime) throw new Error('Match an anime first.');
      const anime = await getAnime(session.anime.id);
      if (
        !anime.my_list_status ||
        ['plan_to_watch', 'on_hold'].includes(anime.my_list_status.status)
      )
        anime.my_list_status = await updateAnime(anime.id, { status: 'watching' });
      session.anime = anime;
      await setSession(message.tabId, session);
      await completed(message.tabId, session);
      return;
    }
    case 'SET_WATCHED': {
      if (
        !positiveInteger(message.animeId) ||
        !Number.isInteger(message.episode) ||
        message.episode < 0 ||
        message.episode > 10000 ||
        !Number.isInteger(message.expectedPrevious) ||
        message.expectedPrevious < 0
      )
        throw new Error('Enter a valid watched episode count.');
      const anime = await getAnime(message.animeId);
      await refreshAnimeSessions(anime);
      if (anime.my_list_status?.is_rewatching)
        throw new Error('Rewatch progress needs to be updated on MyAnimeList.');
      if (anime.num_episodes && message.episode > anime.num_episodes)
        throw new Error('The watched count exceeds this MAL entry.');
      const watched = anime.my_list_status?.num_episodes_watched ?? 0;
      if (watched !== message.expectedPrevious)
        throw new Error(
          `MAL now has ${watched} watched episodes. Review the refreshed count and save again.`,
        );
      if (message.episode !== message.expectedPrevious)
        anime.my_list_status = await updateAnime(
          anime.id,
          message.episode > watched
            ? progressUpdateValues(anime, message.episode)
            : { num_watched_episodes: message.episode },
        );
      if (message.episode < watched) await resetEpisodeTracking(anime.id, message.episode);
      await refreshAnimeSessions(anime);
      for (const item of await getPending())
        if (item.anime.id === anime.id && item.episode <= message.episode)
          await resolvePending(item);
      return anime;
    }
    case 'COMPLETE_ANIME': {
      if (
        !positiveInteger(message.animeId) ||
        !positiveInteger(message.expectedEpisodes) ||
        (message.score !== undefined &&
          (!Number.isInteger(message.score) || message.score < 0 || message.score > 10)) ||
        (message.pendingId !== undefined && typeof message.pendingId !== 'string')
      )
        throw new Error('Choose a valid anime and a whole-number score from 0 to 10.');
      const auth = await getAuth();
      if (!auth) throw new Error('Connect your MyAnimeList account first.');
      const pending =
        message.pendingId === undefined
          ? undefined
          : (await getPending()).find(
              (item) =>
                item.id === message.pendingId &&
                item.anime.id === message.animeId &&
                item.id.startsWith(`${auth.profile?.id}:`),
            );
      if (message.pendingId !== undefined && !pending)
        throw new Error('This final-episode update is no longer available for this account.');
      const anime = await getAnime(message.animeId);
      await refreshAnimeSessions(anime);
      const queued = await getPending();
      if (queued.some((item) => item.anime.id === anime.id))
        await browser.storage.local.set({
          pending: queued.map((item) => (item.anime.id === anime.id ? { ...item, anime } : item)),
        });
      if (anime.status !== 'finished_airing')
        throw new Error('Only anime marked Finished Airing on MyAnimeList can be completed here.');
      if (!anime.num_episodes || !positiveInteger(anime.num_episodes))
        throw new Error(
          'MyAnimeList must have a known total episode count before completing this anime.',
        );
      if (anime.num_episodes !== message.expectedEpisodes)
        throw new Error(
          'The total episode count changed on MyAnimeList. Review the refreshed anime and try again.',
        );
      if (!anime.my_list_status)
        throw new Error('Add this anime to your list before completing it.');
      if (anime.my_list_status.is_rewatching)
        throw new Error('Rewatch progress needs to be updated on MyAnimeList.');
      if (pending && pending.episode !== anime.num_episodes)
        throw new Error('Only the final episode can be logged together with series completion.');
      const watched = anime.my_list_status.num_episodes_watched;
      if (watched < anime.num_episodes && !pending)
        throw new Error('Log all episodes before marking this anime completed.');
      anime.my_list_status = await updateAnime(anime.id, {
        status: 'completed',
        num_watched_episodes: Math.max(watched, anime.num_episodes),
        ...(message.score === undefined ? {} : { score: message.score }),
      });
      await refreshAnimeSessions(anime);
      for (const item of await getPending())
        if (item.anime.id === anime.id && item.episode <= anime.my_list_status.num_episodes_watched)
          await resolvePending(item);
      return anime;
    }
    case 'APPROVE_UPDATE': {
      const pending = (await getPending()).find((p) => p.id === message.id);
      const auth = await getAuth();
      if (!pending || !auth || !pending.id.startsWith(`${auth.profile?.id}:`))
        throw new Error('This update is no longer available for this account.');
      const anime = await getAnime(pending.anime.id);
      if (!anime.my_list_status && pending.anime.my_list_status)
        throw new Error(
          'This anime is no longer in your list. Add it to Currently Watching first.',
        );
      if (anime.my_list_status?.is_rewatching)
        throw new Error('Rewatch progress needs to be updated on MyAnimeList.');
      if (anime.num_episodes && pending.episode > anime.num_episodes)
        throw new Error('The episode exceeds this MAL entry. Correct the match first.');
      if (pending.episode > (anime.my_list_status?.num_episodes_watched ?? 0))
        anime.my_list_status = await updateAnime(
          anime.id,
          progressUpdateValues(anime, pending.episode),
        );
      // Refresh every open tab for the same anime, not just the tab that completed.
      await refreshAnimeSessions(anime);
      await resolvePending(pending);
      return anime;
    }
    case 'DISMISS_UPDATE': {
      const item = (await getPending()).find((p) => p.id === message.id);
      if (item) await resolvePending(item);
      return;
    }
    case 'RECHECK':
      return recheck(message.tabId);
    case 'INJECT_PLAYERS':
      return injectPlayers(message.tabId);
    case 'START_SETUP': {
      const tab = await browser.tabs.get(message.tabId);
      if (!tab.url || new URL(tab.url).protocol !== 'https:')
        throw new Error(
          'Open an HTTPS anime watch page, then start website setup from its Malmark popup.',
        );
      const origin = new URL(tab.url).origin;
      if (!(await browser.permissions.contains({ origins: [origin + '/*'] })))
        throw new Error('Allow access to this domain first.');
      const nonce = crypto.randomUUID();
      await browser.storage.session.set({
        [`setup:${message.tabId}`]: { nonce, origin, expiresAt: Date.now() + 600000 },
      });
      await browser.scripting.executeScript({
        target: { tabId: message.tabId, frameIds: [0] },
        files: ['content.js'],
      });
      await browser.tabs.sendMessage(
        message.tabId,
        { type: 'START_PICKER', nonce },
        { frameId: 0 },
      );
      await browser.tabs.update(message.tabId, { active: true });
      return;
    }
    case 'REMOVE_SITE_CONFIG': {
      const sites = await getSites();
      const site = sites.find((s) => s.id === message.id);
      if (!site) return;
      await removeSiteProgress(site.origin);
      await browser.scripting.unregisterContentScripts({ ids: ['custom-' + site.id] });
      await browser.storage.local.set({ sites: sites.filter((s) => s.id !== site.id) });
      if (!siteForUrl(site.origin))
        await browser.permissions.remove({ origins: [site.origin + '/*'] });
      for (const tab of await browser.tabs.query({}))
        if (tab.id !== undefined && tab.url?.startsWith(site.origin + '/')) {
          await browser.storage.session.remove(`tab:${tab.id}`);
          await badge(tab.id);
          await browser.tabs
            .sendMessage(tab.id, { type: 'SITE_CONFIG_CHANGED' }, { frameId: 0 })
            .catch(() => undefined);
        }
      return;
    }
    default:
      throw new Error('Unknown extension request.');
  }
}

browser.runtime.onMessage.addListener((raw: unknown, sender: browser.Runtime.MessageSender) => {
  if (!raw || typeof raw !== 'object' || !('type' in raw) || sender.id !== browser.runtime.id)
    return false;
  const message = raw as Message;
  const trustedUi =
    !!sender.url &&
    ['popup.html', 'options.html', 'sidebar.html'].some(
      (p) => sender.url!.split('?')[0].split('#')[0] === browser.runtime.getURL(p),
    );
  const handle = async (): Promise<unknown> => {
    if (trustedUi) {
      if (message.type === 'CONNECT') {
        await connect();
        await serialized(async () => {
          await browser.storage.local.remove(['pending', 'resolved']);
          await browser.storage.session.clear();
          for (const tab of await browser.tabs.query({}))
            if (tab.id !== undefined && tab.url && (await supportedUrl(tab.url)))
              await recheck(tab.id);
        });
        return;
      }
      return serialized(() => uiMessage(message));
    }
    if (message.type === 'INLINE_PROMPT_SIZE') {
      if (!Number.isFinite(message.height) || message.height <= 0) return;
      const { item, parentFrameId } = await inlinePromptContext(message.nonce, sender);
      // Deliver only to the content script containing this verified extension frame.
      await browser.tabs
        .sendMessage(item.tabId, message, { frameId: parentFrameId })
        .catch(() => undefined);
      return;
    }
    if (message.type === 'GET_INLINE_PROMPT' || message.type === 'INLINE_PROMPT_ACTION')
      return serialized(async () => {
        const { item } = await inlinePromptContext(message.nonce, sender);
        if (message.type === 'GET_INLINE_PROMPT') return item;
        if (message.action === 'approve') await uiMessage({ type: 'APPROVE_UPDATE', id: item.id });
        else if (message.action === 'later') {
          await browser.storage.local.set({
            pending: (await getPending()).map((p) =>
              p.id === item.id ? { ...p, deferred: true } : p,
            ),
          });
          await browser.tabs
            .sendMessage(item.tabId, { type: 'PROMPT_CHANGED' })
            .catch(() => undefined);
        } else throw new Error('Unknown reminder action.');
        await browser.storage.session.remove(`inlinePrompt:${item.tabId}`);
      });
    if (message.type === 'DETECTION') return serialized(() => detectMessage(message, sender));
    if (message.type === 'PLAYBACK') return serialized(() => playbackMessage(message, sender));
    if (message.type === 'GET_SITE_CONFIG')
      return sender.url ? configForUrl(sender.url) : undefined;
    if (
      message.type === 'SAVE_SITE_CONFIG' &&
      sender.frameId === 0 &&
      sender.tab?.id !== undefined &&
      sender.url
    )
      return serialized(async () => {
        const tabId = sender.tab!.id!;
        const draft = (await browser.storage.session.get(`setup:${tabId}`))[`setup:${tabId}`] as
          { nonce: string; origin: string; expiresAt: number } | undefined;
        const tab = await browser.tabs.get(tabId);
        if (
          !draft ||
          draft.nonce !== message.nonce ||
          draft.expiresAt < Date.now() ||
          !tab.url ||
          !samePage(tab.url, sender.url!) ||
          new URL(sender.url!).origin !== draft.origin
        )
          throw new Error('Setup expired or the page changed. Start website setup again.');
        if (!(await browser.permissions.contains({ origins: [draft.origin + '/*'] })))
          throw new Error('Domain access was removed. Start setup again.');
        if (
          ![message.titleSelector, message.episodeSelector].every(
            (s) => typeof s === 'string' && s.length > 0 && s.length <= 2000,
          )
        )
          throw new Error('Choose valid title and episode elements.');
        const sites = await getSites();
        const previous = sites.find((s) => s.origin === draft.origin);
        const config = {
          id: previous?.id || crypto.randomUUID(),
          origin: draft.origin,
          titleSelector: message.titleSelector,
          episodeSelector: message.episodeSelector,
          createdAt: Date.now(),
        };
        await registerSite(config);
        await browser.storage.local.set({
          sites: [...sites.filter((s) => s.origin !== draft.origin), config],
        });
        await browser.storage.session.remove([`setup:${tabId}`, `tab:${tabId}`]);
        return config;
      });
    if (
      (message.type === 'PROMPT_STATE' || message.type === 'OPEN_EXTENSION') &&
      sender.tab?.id !== undefined
    ) {
      const tab = await browser.tabs.get(sender.tab.id);
      if (!tab.url || !(await supportedUrl(tab.url))) return;
      if (
        sender.frameId !== 0 &&
        (!sender.url ||
          !(await browser.permissions.contains({ origins: [new URL(sender.url).origin + '/*'] })))
      )
        return;
      if (message.type === 'OPEN_EXTENSION') {
        const showReview = () =>
          browser.runtime
            .sendMessage({ type: 'REVIEW_UPDATES', tabId: sender.tab!.id })
            .catch(() => undefined);
        const panel = chromiumSidePanel();
        if (panel?.open) {
          try {
            await panel.open({ tabId: sender.tab.id });
            await showReview();
            return;
          } catch {
            // Some browsers do not preserve a content-script click's user gesture.
          }
        }
        if (
          browser.sidebarAction?.isOpen &&
          tab.windowId !== undefined &&
          (await browser.sidebarAction.isOpen({ windowId: tab.windowId }))
        ) {
          await showReview();
          return;
        }
        return browser.tabs.create({
          url: browser.runtime.getURL(`options.html?tab=${sender.tab.id}&view=watching`),
        });
      }
      return serialized(async () => {
        const session = await getSession(sender.tab!.id!);
        const auth = await getAuth();
        const pending = auth
          ? (await getPending()).filter((p) => p.tabId === sender.tab!.id && !p.deferred)
          : [];
        const item = pending.at(-1);
        return {
          pending,
          notice: await getProgressNotice(sender.tab!.id!, auth?.profile?.id),
          nonce: item
            ? await inlinePromptNonce(sender.tab!.id!, tab.url!, item, sender.frameId ?? 0)
            : undefined,
          showPrompts: (await getSettings()).showPrompts,
          newAnime:
            session?.anime && !session.anime.my_list_status
              ? { id: session.anime.id, title: session.anime.title }
              : undefined,
        };
      });
    }
    throw new Error('This request is only available in the extension.');
  };
  return handle().then(
    (data) => ({ ok: true, data }),
    (error) => ({ ok: false, error: errorText(error) }),
  );
});

browser.tabs.onRemoved.addListener((tabId) => {
  recovery.delete(tabId);
  void serialized(() =>
    browser.storage.session.remove([`tab:${tabId}`, `inlinePrompt:${tabId}`, `notice:${tabId}`]),
  );
});

browser.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.frameId !== 0) return;
  void serialized(async () => {
    const previous = await getSession(details.tabId);
    if (!(await supportedUrl(details.url))) return;
    if (!previous || !samePage(previous.detection.url, details.url)) {
      if (previous) await completed(details.tabId, previous);
      await browser.storage.session.remove(`tab:${details.tabId}`);
      await badge(details.tabId);
    }
    await browser.tabs
      .sendMessage(details.tabId, { type: 'ROUTE_CHANGED', pageUrl: details.url })
      .catch(() => undefined);
    void recoverPlayer(details.tabId);
  });
});

browser.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) {
    void serialized(async () => {
      const previous = await getSession(details.tabId);
      if (previous) await completed(details.tabId, previous);
      await browser.storage.session.remove(`tab:${details.tabId}`);
      await badge(details.tabId);
    });
  } else {
    void injectPlayers(details.tabId).catch(() => undefined);
  }
});

browser.runtime.onInstalled.addListener(async () => {
  // Chromium can restrict local token storage to extension pages and background code.
  const local = browser.storage.local as typeof browser.storage.local & {
    setAccessLevel?: (options: { accessLevel: string }) => Promise<void>;
  };
  await local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  await serialized(async () => {
    await pruneWatchHistory();
    await retireLegacyAccess().catch(() => undefined);
    const entries = await browser.storage.session.get(null);
    for (const [key, value] of Object.entries(entries)) {
      const session = value as WatchSession;
      if (key.startsWith('tab:') && !(await supportedUrl(session.detection.url))) {
        await browser.storage.session.remove(key);
        await badge(Number(key.slice(4)));
      }
    }
  });
  await Promise.allSettled((await getSites()).map(registerSite));
  await Promise.allSettled(
    (await browser.tabs.query({})).flatMap((tab) =>
      tab.id === undefined ? [] : [injectPlayers(tab.id)],
    ),
  );
});

browser.tabs.onActivated.addListener(({ tabId }) => {
  void recoverPlayer(tabId);
});
browser.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'complete') void recoverPlayer(tabId);
});
browser.runtime.onStartup.addListener(async () => {
  await serialized(pruneWatchHistory);
  await Promise.allSettled(
    (await browser.tabs.query({})).flatMap((tab) =>
      tab.id === undefined ? [] : [recoverPlayer(tab.id)],
    ),
  );
});
