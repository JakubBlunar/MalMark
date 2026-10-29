import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Anime,
  Auth,
  Detection,
  PendingUpdate,
  Reply,
  WatchSession,
} from '../src/shared/types';
import { emptyProgress } from '../src/shared/progress';

const mock = vi.hoisted(() => {
  let local: Record<string, unknown> = {};
  let session: Record<string, unknown> = {};
  const area = (which: 'local' | 'session') => ({
    get: vi.fn(async (key: string | null) => {
      const data = which === 'local' ? local : session;
      return structuredClone(key === null ? data : { [key]: data[key] });
    }),
    set: vi.fn(async (values: Record<string, unknown>) =>
      Object.assign(which === 'local' ? local : session, structuredClone(values)),
    ),
    remove: vi.fn(async (key: string | string[]) => {
      for (const k of Array.isArray(key) ? key : [key])
        delete (which === 'local' ? local : session)[k];
    }),
    clear: vi.fn(async () => {
      if (which === 'local') local = {};
      else session = {};
    }),
  });
  const browser = {
    storage: { local: area('local'), session: area('session') },
    runtime: {
      id: 'test',
      getURL: (p: string) => `moz-extension://test/${p}`,
      onMessage: { addListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    tabs: {
      get: vi.fn(async () => ({ id: 1, url: 'https://www.crunchyroll.com/watch/show?ep=1' })),
      query: vi.fn(async () => [] as { id: number; url: string }[]),
      sendMessage: vi.fn(async () => undefined),
      create: vi.fn(),
      update: vi.fn(),
      onRemoved: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
    },
    identity: {
      getRedirectURL: () => 'https://test.extensions.allizom.org/',
      launchWebAuthFlow: vi.fn(),
    },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setTitle: vi.fn(async () => undefined),
    },
    permissions: {
      getAll: vi.fn(async () => ({ origins: [] })),
      contains: vi.fn(async () => false),
      remove: vi.fn(),
    },
    scripting: {
      executeScript: vi.fn(),
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts: vi.fn(),
      unregisterContentScripts: vi.fn(),
    },
    webNavigation: { getAllFrames: vi.fn(async () => []), onCommitted: { addListener: vi.fn() } },
  };
  return {
    browser,
    setupRequired: false,
    reset: () => {
      local = {};
      session = {};
    },
    getLocal: () => local,
    getSession: () => session,
  };
});
vi.mock('webextension-polyfill', () => ({ default: mock.browser }));
vi.mock('../src/shared/config', () => ({
  MAL_CLIENT_ID: 'client',
  get OAUTH_SETUP_REQUIRED() {
    return mock.setupRequired;
  },
}));
import '../src/background/index';
import { getSettings } from '../src/background/storage';
import { saveWatchProgress } from '../src/background/watch-history';
import { retireLegacyAccess, supportedUrl } from '../src/background/sites';
import {
  authorizationCode,
  authorizationUrl,
  connect,
  exchangeToken,
  getAnime,
  randomString,
  request,
  searchAnime,
} from '../src/background/mal';
const ui = { id: 'test', url: 'moz-extension://test/popup.html' };
const content = {
  id: 'test',
  url: 'https://www.crunchyroll.com/watch/show?ep=1',
  tab: { id: 1 },
  frameId: 0,
};
const listener = mock.browser.runtime.onMessage.addListener.mock.calls[0][0] as (
  v: unknown,
  s: unknown,
) => Promise<Reply<unknown>>;
const installed = mock.browser.runtime.onInstalled.addListener.mock
  .calls[0][0] as () => Promise<void>;
const startupListener = mock.browser.runtime.onStartup.addListener.mock
  .calls[0][0] as () => Promise<void>;
const activatedListener = mock.browser.tabs.onActivated.addListener.mock.calls[0][0] as (info: {
  tabId: number;
}) => void;
const updatedListener = mock.browser.tabs.onUpdated.addListener.mock.calls[0][0] as (
  id: number,
  info: { status: string },
) => void;
async function message<T = unknown>(
  value: unknown,
  sender: Record<string, unknown> = ui,
): Promise<Reply<T>> {
  return listener(value, sender) as Promise<Reply<T>>;
}
const detection: Detection = {
  site: 'crunchyroll',
  url: content.url,
  seriesKey: 'crunchyroll:SHOW:s?',
  title: 'A Show',
  episode: 2,
  season: null,
};
const anime: Anime = {
  id: 1,
  title: 'A Show',
  num_episodes: 12,
  my_list_status: { status: 'watching', num_episodes_watched: 1, score: 9 },
};
const auth: Auth = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3600000,
  clientId: 'client',
  profile: { id: 5, name: 'viewer' },
};
function session(): WatchSession {
  return {
    detection,
    anime,
    match: 'matched',
    matchSource: 'automatic',
    episode: 2,
    progress: emptyProgress(),
    frameOrigins: [],
    playerConnected: false,
    updatedAt: Date.now(),
  };
}
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
beforeEach(async () => {
  mock.reset();
  mock.setupRequired = false;
  mock.browser.identity.launchWebAuthFlow.mockReset();
  vi.unstubAllGlobals();
  await mock.browser.storage.local.set({
    auth,
    settings: { clientId: 'client', threshold: 90, minWatchSeconds: 60, showPrompts: true },
  });
  mock.browser.tabs.get.mockResolvedValue({ id: 1, url: content.url });
  mock.browser.permissions.contains.mockResolvedValue(false);
});
describe('OAuth and MAL transport', () => {
  it('requires personal API setup for unpacked builds, without changing an existing login', async () => {
    mock.setupRequired = true;
    const snapshot = await message<{ connected: boolean; oauth: unknown; redirectUrl: string }>({
      type: 'GET_STATE',
    });
    expect(snapshot.ok && snapshot.data.connected).toBe(true);
    expect(snapshot.ok && snapshot.data.oauth).toEqual({ mode: 'unpacked', clientId: '' });
    expect(snapshot.ok && snapshot.data.redirectUrl).toBe('https://test.extensions.allizom.org/');
    expect(mock.getLocal().auth).toEqual(auth);
    await mock.browser.storage.local.remove('auth');
    await expect(connect()).rejects.toThrow('Set up your MyAnimeList app');
    expect(mock.browser.identity.launchWebAuthFlow).not.toHaveBeenCalled();
  });
  it('saves a personal client ID only from the signed-out extension UI', async () => {
    mock.setupRequired = true;
    const request = { type: 'SAVE_OAUTH_CLIENT', clientId: '  personal-client  ' };
    expect((await message(request)).ok).toBe(false);
    await mock.browser.storage.local.remove('auth');
    expect((await message(request, content)).ok).toBe(false);
    expect(mock.getLocal().oauthClientId).toBeUndefined();
    expect((await message(request)).ok).toBe(true);
    expect(mock.getLocal().oauthClientId).toBe('personal-client');
    expect((await message({ type: 'LOGOUT' })).ok).toBe(true);
    expect(mock.getLocal().oauthClientId).toBe('personal-client');
    mock.setupRequired = false;
    expect((await message({ type: 'SAVE_OAUTH_CLIENT', clientId: 'another-client' })).ok).toBe(
      false,
    );
  });
  it.each(['', 'https://example.org/', 'bad client id', '<script>', null])(
    'rejects an invalid public client ID: %s',
    async (clientId) => {
      mock.setupRequired = true;
      await mock.browser.storage.local.remove('auth');
      expect((await message({ type: 'SAVE_OAUTH_CLIENT', clientId })).ok).toBe(false);
      expect(mock.getLocal().oauthClientId).toBeUndefined();
    },
  );
  it('uses the saved personal client for authorization and token exchange', async () => {
    mock.setupRequired = true;
    await mock.browser.storage.local.remove('auth');
    await message({ type: 'SAVE_OAUTH_CLIENT', clientId: 'personal-client' });
    mock.browser.identity.launchWebAuthFlow.mockImplementationOnce(
      async ({ url }: { url: string }) => {
        const authorization = new URL(url);
        expect(authorization.searchParams.get('client_id')).toBe('personal-client');
        const callback = new URL(authorization.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', authorization.searchParams.get('state')!);
        callback.searchParams.set('code', 'fixture-code');
        return callback.href;
      },
    );
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json({ id: 5, name: 'viewer' }));
    vi.stubGlobal('fetch', fetch);
    await connect();
    const token = new URLSearchParams(fetch.mock.calls[0][1].body);
    expect(token.get('client_id')).toBe('personal-client');
    expect(token.get('redirect_uri')).toBe('https://test.extensions.allizom.org/');
    expect(token.has('client_secret')).toBe(false);
    expect((mock.getLocal().auth as Auth).clientId).toBe('personal-client');
  });
  it('cancels a pending login if its personal app configuration changes', async () => {
    mock.setupRequired = true;
    await mock.browser.storage.local.remove('auth');
    await message({ type: 'SAVE_OAUTH_CLIENT', clientId: 'personal-client' });
    let finish!: (url: string) => void;
    mock.browser.identity.launchWebAuthFlow.mockImplementationOnce(
      async ({ url }: { url: string }) => {
        const authorization = new URL(url);
        const callback = new URL(authorization.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', authorization.searchParams.get('state')!);
        callback.searchParams.set('code', 'fixture-code');
        await new Promise<string>((resolve) => {
          finish = resolve;
        });
        return callback.href;
      },
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ access_token: 'old-client-access', refresh_token: 'refresh', expires_in: 3600 }),
        )
        .mockResolvedValueOnce(json({ id: 5, name: 'viewer' })),
    );
    const login = connect();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await message({ type: 'SAVE_OAUTH_CLIENT', clientId: 'replacement-client' });
    finish('done');
    await expect(login).rejects.toThrow('cancelled');
    expect(mock.getLocal().auth).toBeUndefined();
  });
  it('explains a confidential client mismatch at the token endpoint', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ error: 'invalid_client' }, 401));
    vi.stubGlobal('fetch', fetch);
    await expect(
      exchangeToken(
        new URLSearchParams({
          client_id: 'client',
          grant_type: 'authorization_code',
          code: 'fixture-code',
          code_verifier: 'a'.repeat(96),
        }),
      ),
    ).rejects.toThrow('app registration');
    expect(fetch.mock.calls[0][1].body).not.toContain('client_secret');
  });
  it('asks for a fresh sign-in when an authorization grant is rejected', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: 'invalid_grant' }, 400)));
    await expect(exchangeToken(new URLSearchParams({ client_id: 'client' }))).rejects.toThrow(
      'fresh sign-in',
    );
  });
  it('shows a sign-in error without requiring users to configure OAuth', async () => {
    mock.browser.identity.launchWebAuthFlow.mockRejectedValueOnce(
      new Error('Authorization page could not be loaded.'),
    );
    await expect(connect()).rejects.toThrow('MyAnimeList sign-in could not open');
    const details = mock.browser.identity.launchWebAuthFlow.mock.calls.at(-1)![0] as {
      url: string;
    };
    expect(new URL(details.url).searchParams.get('redirect_uri')).toBe(
      'https://test.extensions.allizom.org/',
    );
  });
  it('uses the bundled application ID even when legacy settings contain another ID', async () => {
    await mock.browser.storage.local.set({
      settings: {
        clientId: 'old-user-client',
        threshold: 85,
        minWatchSeconds: 90,
        showPrompts: false,
      },
    });
    mock.browser.identity.launchWebAuthFlow.mockImplementationOnce(
      async (details: { url: string }) => {
        const url = new URL(details.url);
        expect(url.searchParams.get('client_id')).toBe('client');
        const callback = new URL(url.searchParams.get('redirect_uri')!);
        callback.searchParams.set('code', 'fixture-code');
        callback.searchParams.set('state', url.searchParams.get('state')!);
        return callback.href;
      },
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }),
        )
        .mockResolvedValueOnce(json({ id: 5, name: 'viewer' })),
    );
    await connect();
    expect((mock.getLocal().auth as Auth).clientId).toBe('client');
    expect(await getSettings()).toEqual({
      threshold: 85,
      minWatchSeconds: 90,
      showPrompts: false,
      promptAtEnd: true,
    });
  });
  it('preserves existing tokens while discarding legacy API preferences from snapshots', async () => {
    const response = await message<{ settings: unknown; connected: boolean }>({
      type: 'GET_STATE',
    });
    expect(response.ok && response.data.settings).toEqual({
      threshold: 90,
      minWatchSeconds: 60,
      showPrompts: true,
      promptAtEnd: true,
    });
    expect(response.ok && response.data.connected).toBe(true);
    expect(mock.getLocal().auth).toEqual(auth);
    const settings = {
      clientId: 'ignored',
      threshold: 95,
      minWatchSeconds: 120,
      showPrompts: false,
      promptAtEnd: false,
    };
    expect((await message({ type: 'SAVE_SETTINGS', settings })).ok).toBe(true);
    expect(mock.getLocal().settings).toEqual({
      threshold: 95,
      minWatchSeconds: 120,
      showPrompts: false,
      promptAtEnd: false,
    });
  });
  it('uses unique PKCE verifiers and state', () => {
    const a = randomString();
    expect(a).toHaveLength(96);
    expect(randomString()).not.toBe(a);
  });
  it('builds public-client authorization with documented plain PKCE', () => {
    const url = new URL(
      authorizationUrl('client', 'https://redirect.example/', 'verifier', 'state'),
    );
    expect(url.searchParams.get('code_challenge_method')).toBe('plain');
    expect(url.searchParams.get('state')).toBe('state');
    expect(url.searchParams.has('client_secret')).toBe(false);
  });
  it('validates both redirect and state before accepting a code', () => {
    expect(
      authorizationCode(
        'https://redirect.example/?code=code&state=ok',
        'https://redirect.example/',
        'ok',
      ),
    ).toBe('code');
    expect(() =>
      authorizationCode(
        'https://attacker.example/?code=code&state=ok',
        'https://redirect.example/',
        'ok',
      ),
    ).toThrow('verified');
    expect(() =>
      authorizationCode(
        'https://redirect.example/?code=code&state=wrong',
        'https://redirect.example/',
        'ok',
      ),
    ).toThrow('verified');
  });
  it('sends search and detail requests with the user token', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ node: anime }] }))
      .mockResolvedValueOnce(json(anime));
    vi.stubGlobal('fetch', fetch);
    expect(await searchAnime('A Show')).toEqual([anime]);
    await getAnime(1);
    expect(fetch.mock.calls[0][0]).toContain('/v2/anime?q=A+Show');
    expect(fetch.mock.calls[1][0]).toContain('/anime/1?fields=');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer access');
  });
  it('refreshes expired tokens once for simultaneous requests', async () => {
    await mock.browser.storage.local.set({ auth: { ...auth, expiresAt: 0 } });
    const fetch = vi
      .fn()
      .mockImplementation(async (url: string) =>
        url.endsWith('/token')
          ? json({ access_token: 'fresh', refresh_token: 'rotated', expires_in: 3600 })
          : json(anime),
      );
    vi.stubGlobal('fetch', fetch);
    await Promise.all([request('/anime/1'), request('/anime/1')]);
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/token'))).toHaveLength(1);
    expect((mock.getLocal().auth as Auth).refreshToken).toBe('rotated');
  });
  it('clears expired credentials when the refresh token is rejected', async () => {
    await mock.browser.storage.local.set({ auth: { ...auth, expiresAt: 0 } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 400)));
    await expect(request('/anime/1')).rejects.toThrow('expired');
    expect(mock.getLocal().auth).toBeUndefined();
  });
  it('retries an unauthorized API call once after token renewal', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(
        json({ access_token: 'fresh', refresh_token: 'rotated', expires_in: 3600 }),
      )
      .mockResolvedValueOnce(json(anime));
    vi.stubGlobal('fetch', fetch);
    await request('/anime/1');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2][1].headers.Authorization).toBe('Bearer fresh');
  });
});
describe('finished series completion', () => {
  const finished: Anime = {
    ...anime,
    status: 'finished_airing',
    my_list_status: { ...anime.my_list_status!, num_episodes_watched: 12 },
  };
  const complete = { type: 'COMPLETE_ANIME', animeId: 1, expectedEpisodes: 12 };
  const finale = (): PendingUpdate => ({
    id: '5:1:12',
    anime: finished,
    episode: 12,
    previous: 11,
    tabId: 1,
    createdAt: Date.now(),
  });

  it('completes and scores a fully watched finished-airing anime, refreshing every matching tab', async () => {
    const previous = { ...session(), anime: finished, episode: 12 };
    await mock.browser.storage.session.set({ 'tab:1': previous, 'tab:2': previous });
    const status = { ...finished.my_list_status!, status: 'completed', score: 8 };
    const fetch = vi.fn().mockResolvedValueOnce(json(finished)).mockResolvedValueOnce(json(status));
    vi.stubGlobal('fetch', fetch);
    expect((await message({ ...complete, score: 8 })).ok).toBe(true);
    expect(fetch.mock.calls[1][1].method).toBe('PATCH');
    expect(new URLSearchParams(fetch.mock.calls[1][1].body)).toEqual(
      new URLSearchParams('status=completed&num_watched_episodes=12&score=8'),
    );
    expect(new URL(fetch.mock.calls[0][0]).searchParams.get('fields')?.split(',')).toContain(
      'status',
    );
    for (const tab of [1, 2])
      expect((mock.getSession()[`tab:${tab}`] as WatchSession).anime?.my_list_status).toEqual(
        status,
      );
  });
  it('logs a queued final episode and completes it in one approved update without changing an existing score', async () => {
    await mock.browser.storage.local.set({ pending: [finale()] });
    const fresh = {
      ...finished,
      my_list_status: { ...finished.my_list_status!, num_episodes_watched: 11 },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(fresh))
      .mockResolvedValueOnce(json({ ...finished.my_list_status, status: 'completed' }));
    vi.stubGlobal('fetch', fetch);
    expect((await message({ ...complete, pendingId: '5:1:12' })).ok).toBe(true);
    expect(fetch.mock.calls[1][1].body).toBe('status=completed&num_watched_episodes=12');
    expect(mock.getLocal().pending).toEqual([]);
  });
  it('keeps ordinary final-episode approval limited to watched progress', async () => {
    await mock.browser.storage.local.set({ pending: [finale()] });
    const fresh = {
      ...finished,
      my_list_status: { ...finished.my_list_status!, num_episodes_watched: 11 },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(fresh))
      .mockResolvedValueOnce(json(finished.my_list_status));
    vi.stubGlobal('fetch', fetch);
    expect((await message({ type: 'APPROVE_UPDATE', id: '5:1:12' })).ok).toBe(true);
    expect(fetch.mock.calls[1][1].body).toBe('num_watched_episodes=12');
  });
  it.each<Partial<Anime>>([
    { status: 'currently_airing' },
    { status: 'not_yet_aired' },
    { status: undefined },
    { num_episodes: 0 },
    { num_episodes: undefined },
    { num_episodes: 13 },
    { my_list_status: undefined },
    { my_list_status: { ...anime.my_list_status!, num_episodes_watched: 11 } },
    { my_list_status: { ...finished.my_list_status!, is_rewatching: true } },
  ])('rechecks MAL and refuses completion for ineligible data: %j', async (overrides) => {
    const fetch = vi.fn().mockResolvedValue(json({ ...finished, ...overrides }));
    vi.stubGlobal('fetch', fetch);
    expect((await message(complete)).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([-1, 11, 1.5, '8', null])(
    'rejects an invalid score %s before contacting MAL',
    async (score) => {
      const fetch = vi.fn();
      vi.stubGlobal('fetch', fetch);
      expect((await message({ ...complete, score })).ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('accepts score zero explicitly and never reduces an existing watched count', async () => {
    const fresh = {
      ...finished,
      my_list_status: { ...finished.my_list_status!, num_episodes_watched: 13 },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(fresh))
      .mockResolvedValueOnce(json({ ...fresh.my_list_status, status: 'completed', score: 0 }));
    vi.stubGlobal('fetch', fetch);
    expect((await message({ ...complete, score: 0 })).ok).toBe(true);
    expect(fetch.mock.calls[1][1].body).toBe('status=completed&num_watched_episodes=13&score=0');
  });
  it('rejects foreign, missing and non-final pending updates', async () => {
    await mock.browser.storage.local.set({
      pending: [
        { ...finale(), id: '6:1:12' },
        { ...finale(), id: '5:1:11', episode: 11 },
      ],
    });
    const fetch = vi.fn().mockResolvedValue(json(finished));
    vi.stubGlobal('fetch', fetch);
    for (const pendingId of ['6:1:12', 'missing', '5:1:11'])
      expect((await message({ ...complete, pendingId })).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects completion requested by page scripts', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await message(complete, content)).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('leaves a finale queued if saving completion fails', async () => {
    await mock.browser.storage.local.set({ pending: [finale()] });
    const fresh = {
      ...finished,
      my_list_status: { ...finished.my_list_status!, num_episodes_watched: 11 },
    };
    const fetch = vi.fn().mockResolvedValueOnce(json(fresh)).mockResolvedValueOnce(json({}, 503));
    vi.stubGlobal('fetch', fetch);
    expect((await message({ ...complete, pendingId: '5:1:12', score: 8 })).ok).toBe(false);
    expect(mock.getLocal().pending).toHaveLength(1);
    expect(mock.getLocal().resolved).toBeUndefined();
  });
});

describe('background consent boundary', () => {
  it.each([false, true])(
    'restores logged-episode playback after refresh without another MAL update (rewatching: %s)',
    async (rewatching) => {
      const previous = session();
      previous.anime = {
        ...anime,
        my_list_status: {
          ...anime.my_list_status!,
          num_episodes_watched: 2,
          is_rewatching: rewatching,
        },
      };
      previous.progress = { ranges: [[0, 20]], watched: 20, position: 20, duration: 1000 };
      await saveWatchProgress(previous);
      const fetch = vi
        .fn()
        .mockImplementation(async () =>
          json({ data: [{ node: previous.anime }], ...previous.anime }),
        );
      vi.stubGlobal('fetch', fetch);
      const redetect = () =>
        message(
          { type: 'DETECTION', detection, pageUrl: detection.url, frameOrigins: [] },
          content,
        );
      expect((await redetect()).ok).toBe(true);
      expect((mock.getSession()['tab:1'] as WatchSession).progress.watched).toBe(20);
      expect((await redetect()).ok).toBe(true);
      expect((mock.getLocal().watchHistory as any[])[0].progress.watched).toBe(20);
      // Crossing the prompt threshold while replaying never logs an already watched episode.
      const restored = mock.getSession()['tab:1'] as WatchSession;
      restored.progress = { ranges: [[0, 900]], watched: 900, position: 900, duration: 1000 };
      await mock.browser.storage.session.set({ 'tab:1': restored });
      await message(
        {
          type: 'PLAYBACK',
          pageUrl: content.url,
          playback: {
            videoId: 'replay',
            currentTime: 900,
            duration: 1000,
            paused: false,
            ended: false,
            rate: 1,
            sentAt: Date.now(),
          },
        },
        content,
      );
      expect(mock.getLocal().pending ?? []).toEqual([]);
      expect(
        fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET'),
      ).toBe(true);
    },
  );
  it('reconnects existing watch tabs on browser startup', async () => {
    mock.browser.permissions.contains.mockResolvedValue(true);
    mock.browser.tabs.query.mockResolvedValueOnce([{ id: 57, url: content.url }]);
    mock.browser.scripting.executeScript.mockClear();
    await startupListener();
    expect(mock.browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 57, frameIds: [0] },
      files: ['content.js'],
    });
  });
  it('retries when a restored tab finishes loading or becomes active', async () => {
    mock.browser.permissions.contains.mockResolvedValue(true);
    mock.browser.scripting.executeScript.mockClear();
    activatedListener({ tabId: 58 });
    updatedListener(59, { status: 'complete' });
    await vi.waitFor(() => {
      expect(mock.browser.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 58, frameIds: [0] },
        files: ['content.js'],
      });
      expect(mock.browser.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 59, frameIds: [0] },
        files: ['content.js'],
      });
    });
  });
  it('distinguishes a match from live playback on the badge', async () => {
    const s = session();
    await mock.browser.storage.session.set({ 'tab:55': s });
    await message({ type: 'GET_STATE', tabId: 55 });
    expect(mock.browser.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 55, text: '…' });
    s.progress.last = {
      videoId: 'current',
      currentTime: 10,
      duration: 1000,
      paused: false,
      ended: false,
      rate: 1,
      sentAt: Date.now(),
    };
    await mock.browser.storage.session.set({ 'tab:55': s });
    await message({ type: 'GET_STATE', tabId: 55 });
    expect(mock.browser.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 55, text: '✓' });
    s.progress.last.sentAt -= 20000;
    await mock.browser.storage.session.set({ 'tab:55': s });
    await message({ type: 'GET_STATE', tabId: 55 });
    expect(mock.browser.action.setBadgeText).toHaveBeenLastCalledWith({ tabId: 55, text: '…' });
  });
  it('reconnects a missing tracker when the popup reads state, without a MAL refresh', async () => {
    mock.browser.permissions.contains.mockResolvedValue(true);
    mock.browser.scripting.executeScript.mockClear();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await message({ type: 'GET_STATE', tabId: 56 });
    await vi.waitFor(() =>
      expect(mock.browser.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 56, frameIds: [0] },
        files: ['content.js'],
      }),
    );
    mock.browser.scripting.executeScript.mockClear();
    await message({ type: 'GET_STATE', tabId: 56 });
    expect(mock.browser.scripting.executeScript).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('restores a checkpoint through detection after all tab sessions are lost', async () => {
    const previous = session();
    previous.progress = { ranges: [[0, 100]], watched: 100, position: 100, duration: 1000 };
    await saveWatchProgress(previous);
    await mock.browser.storage.session.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => json({ data: [{ node: anime }], ...anime })),
    );
    expect(
      (
        await message(
          { type: 'DETECTION', detection, pageUrl: detection.url, frameOrigins: [] },
          content,
        )
      ).ok,
    ).toBe(true);
    const restored = mock.getSession()['tab:1'] as WatchSession;
    expect(restored.progress.watched).toBe(100);
    expect(restored.progress.last).toBeUndefined();
    expect(restored.playerConnected).toBe(false);
    expect((await message({ type: 'LOGOUT' })).ok).toBe(true);
    expect(mock.getLocal().watchHistory).toBeUndefined();
  });
  it('shows a stale player as disconnected and retries injection on recheck', async () => {
    const previous = session();
    previous.playerConnected = true;
    previous.progress = {
      ...previous.progress,
      duration: 1000,
      last: {
        videoId: 'stale',
        currentTime: 10,
        duration: 1000,
        sentAt: Date.now() - 20000,
        paused: false,
        ended: false,
        rate: 1,
      },
    };
    await mock.browser.storage.session.set({ 'tab:1': previous });
    const reply = await message<{ session: WatchSession }>({ type: 'GET_STATE', tabId: 1 });
    expect(reply.ok && reply.data.session.playerConnected).toBe(false);
    mock.browser.permissions.contains.mockResolvedValue(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(anime)));
    mock.browser.scripting.executeScript.mockClear();
    await message({ type: 'RECHECK', tabId: 1 });
    expect(mock.browser.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 1, frameIds: [0] },
      files: ['content.js'],
    });
  });
  it('allows the sidebar to use the same trusted account and progress controls', async () => {
    const response = await message<{ connected: boolean }>(
      { type: 'GET_STATE', tabId: 1 },
      {
        id: 'test',
        url: 'moz-extension://test/sidebar.html',
      },
    );
    expect(response.ok && response.data.connected).toBe(true);
    expect(JSON.stringify(response)).not.toContain('accessToken');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(anime))
      .mockResolvedValueOnce(json({ ...anime.my_list_status, num_episodes_watched: 2 }));
    vi.stubGlobal('fetch', fetch);
    expect(
      (
        await message(
          { type: 'SET_WATCHED', animeId: 1, episode: 2, expectedPrevious: 1 },
          { id: 'test', url: 'moz-extension://test/sidebar.html' },
        )
      ).ok,
    ).toBe(true);
    expect(fetch.mock.calls[1][1].body).toBe('num_watched_episodes=2');
    expect(
      (
        await message(
          { type: 'GET_STATE' },
          { id: 'test', url: 'moz-extension://test/sidebar.html.evil' },
        )
      ).ok,
    ).toBe(false);
  });
  it('never exposes tokens in the popup snapshot', async () => {
    const response = await message({ type: 'GET_STATE', tabId: 1 });
    expect(response.ok).toBe(true);
    expect(JSON.stringify(response)).not.toContain('accessToken');
    expect(JSON.stringify(response)).not.toContain('refreshToken');
  });
  it('rejects privileged UI operations sent by content scripts', async () => {
    const response = await message({ type: 'GET_STATE' }, content);
    expect(response.ok).toBe(false);
    const update = await message({ type: 'APPROVE_UPDATE', id: '5:1:2' }, content);
    expect(update.ok).toBe(false);
    expect(
      (await message({ type: 'SET_WATCHED', animeId: 1, episode: 0, expectedPrevious: 1 }, content))
        .ok,
    ).toBe(false);
  });
  it('requires a top-frame detection from the current supported URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ data: [] })));
    await message(
      { type: 'DETECTION', detection, pageUrl: content.url, frameOrigins: [] },
      { ...content, frameId: 2 },
    );
    expect(mock.getSession()).toEqual({});
    await message(
      {
        type: 'DETECTION',
        detection,
        pageUrl: 'https://www.crunchyroll.com/watch/old',
        frameOrigins: [],
      },
      content,
    );
    expect(mock.getSession()).toEqual({});
  });
  it('cannot add to MAL from detection alone', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ data: [{ node: { ...anime, my_list_status: undefined } }] }))
      .mockResolvedValueOnce(json({ ...anime, my_list_status: undefined }));
    vi.stubGlobal('fetch', fetch);
    await message(
      { type: 'DETECTION', detection, pageUrl: content.url, frameOrigins: [] },
      content,
    );
    expect(fetch.mock.calls.every(([, options]) => !options?.method)).toBe(true);
    expect((mock.getSession()['tab:1'] as WatchSession).anime?.id).toBe(1);
  });
  it('adds only after the trusted UI confirms, preserving episode count', async () => {
    await mock.browser.storage.session.set({ 'tab:1': session() });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ ...anime, my_list_status: undefined }))
      .mockResolvedValueOnce(json({ status: 'watching', num_episodes_watched: 0 }));
    vi.stubGlobal('fetch', fetch);
    expect((await message({ type: 'ADD_WATCHING', tabId: 1 })).ok).toBe(true);
    expect(fetch.mock.calls[1][1].method).toBe('PATCH');
    expect(fetch.mock.calls[1][1].body).toBe('status=watching');
  });
  it('stores completion once without writing until confirmation', async () => {
    const s = session();
    s.progress = { ranges: [[0, 900]], watched: 900, position: 900, duration: 1000 };
    await mock.browser.storage.session.set({ 'tab:1': s });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const p = {
      videoId: 'v1',
      currentTime: 900,
      duration: 1000,
      paused: false,
      ended: false,
      rate: 1,
      sentAt: Date.now(),
    };
    await message({ type: 'PLAYBACK', playback: p, pageUrl: content.url }, content);
    await message({ type: 'PLAYBACK', playback: p, pageUrl: content.url }, content);
    expect(mock.getLocal().pending).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps the previous episode queued when autoplay clears detection', async () => {
    const s = session();
    s.progress = { ranges: [[0, 700]], watched: 700, position: 970, duration: 1000 };
    await mock.browser.storage.session.set({ 'tab:1': s });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await message(
      { type: 'DETECTION', detection: null, pageUrl: content.url, frameOrigins: [] },
      content,
    );
    expect(mock.getSession()['tab:1']).toBeUndefined();
    expect(mock.getLocal().pending).toEqual([expect.objectContaining({ episode: 2, anime })]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps an earlier queued episode when correcting the next episode', async () => {
    const s = session();
    s.episode = 3;
    await mock.browser.storage.session.set({ 'tab:1': s });
    await mock.browser.storage.local.set({
      pending: [
        { id: '5:1:2', anime, episode: 2, previous: 1, createdAt: Date.now(), tabId: 1 },
        { id: '5:1:3', anime, episode: 3, previous: 1, createdAt: Date.now(), tabId: 1 },
      ],
    });
    expect((await message({ type: 'SET_EPISODE', tabId: 1, episode: 4 })).ok).toBe(true);
    expect(mock.getLocal().pending).toEqual([expect.objectContaining({ episode: 2 })]);
  });
  it('accepts 65% and queues existing qualifying playback when settings are saved', async () => {
    const s = session();
    s.progress = { ranges: [[0, 700]], watched: 700, position: 800, duration: 1000 };
    await mock.browser.storage.session.set({ 'tab:1': s });
    expect(
      (
        await message({
          type: 'SAVE_SETTINGS',
          settings: {
            threshold: 65,
            minWatchSeconds: 60,
            showPrompts: true,
            promptAtEnd: true,
          },
        })
      ).ok,
    ).toBe(true);
    expect(mock.getLocal().pending).toHaveLength(1);
    expect(
      (
        await message({
          type: 'SAVE_SETTINGS',
          settings: {
            threshold: 49,
            minWatchSeconds: 60,
            showPrompts: true,
            promptAtEnd: true,
          },
        })
      ).ok,
    ).toBe(false);
  });
  it.each([0, 2, 12])(
    'sets an explicit watched total of %s and refreshes all matching tabs',
    async (episode) => {
      await mock.browser.storage.session.set({ 'tab:1': session(), 'tab:2': session() });
      const status = { ...anime.my_list_status, num_episodes_watched: episode };
      const fetch = vi.fn().mockResolvedValueOnce(json(anime)).mockResolvedValueOnce(json(status));
      vi.stubGlobal('fetch', fetch);
      expect(
        (await message({ type: 'SET_WATCHED', animeId: 1, episode, expectedPrevious: 1 })).ok,
      ).toBe(true);
      expect(fetch.mock.calls[1][1].body).toBe(`num_watched_episodes=${episode}`);
      expect((mock.getSession()['tab:1'] as WatchSession).anime?.my_list_status).toEqual(status);
      expect((mock.getSession()['tab:2'] as WatchSession).anime?.my_list_status).toEqual(status);
    },
  );
  it('refuses a manual change if MAL changed since the displayed count', async () => {
    await mock.browser.storage.session.set({ 'tab:1': session() });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({ ...anime, my_list_status: { ...anime.my_list_status, num_episodes_watched: 5 } }),
      );
    vi.stubGlobal('fetch', fetch);
    const reply = await message({
      type: 'SET_WATCHED',
      animeId: 1,
      episode: 2,
      expectedPrevious: 1,
    });
    expect(reply.ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (mock.getSession()['tab:1'] as WatchSession).anime?.my_list_status?.num_episodes_watched,
    ).toBe(5);
  });
  it.each([-1, 1.5, 13])('rejects an invalid manual watched count of %s', async (episode) => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json(anime)));
    vi.stubGlobal('fetch', fetch);
    expect(
      (await message({ type: 'SET_WATCHED', animeId: 1, episode, expectedPrevious: 1 })).ok,
    ).toBe(false);
    expect(fetch.mock.calls.every((call) => !((call as unknown[])[1] as any)?.method)).toBe(true);
  });
  it.each([
    { ...anime, my_list_status: undefined },
    { ...anime, my_list_status: { ...anime.my_list_status, is_rewatching: true } },
  ])('does not change removed entries or rewatch counts manually', async (entry) => {
    const fetch = vi.fn().mockResolvedValue(json(entry));
    vi.stubGlobal('fetch', fetch);
    expect(
      (await message({ type: 'SET_WATCHED', animeId: 1, episode: 2, expectedPrevious: 1 })).ok,
    ).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('manual saves clear covered reminders and leave failures queued', async () => {
    const pending = {
      id: '5:1:2',
      anime,
      episode: 2,
      previous: 1,
      createdAt: Date.now(),
      tabId: 1,
    };
    await mock.browser.storage.local.set({ pending: [pending] });
    const fetch = vi.fn().mockResolvedValueOnce(json(anime)).mockResolvedValueOnce(json({}, 503));
    vi.stubGlobal('fetch', fetch);
    expect(
      (await message({ type: 'SET_WATCHED', animeId: 1, episode: 2, expectedPrevious: 1 })).ok,
    ).toBe(false);
    expect(mock.getLocal().pending).toHaveLength(1);
    fetch
      .mockResolvedValueOnce(json(anime))
      .mockResolvedValueOnce(json({ ...anime.my_list_status, num_episodes_watched: 2 }));
    expect(
      (await message({ type: 'SET_WATCHED', animeId: 1, episode: 2, expectedPrevious: 1 })).ok,
    ).toBe(true);
    expect(mock.getLocal().pending).toEqual([]);
  });
  it('uses the correct write field and preserves scores and status', async () => {
    const pending: PendingUpdate = {
      id: '5:1:2',
      anime,
      episode: 2,
      previous: 1,
      createdAt: Date.now(),
      tabId: 1,
    };
    await mock.browser.storage.local.set({ pending: [pending] });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json(anime))
      .mockResolvedValueOnce(json({ ...anime.my_list_status, num_episodes_watched: 2 }));
    vi.stubGlobal('fetch', fetch);
    expect((await message({ type: 'APPROVE_UPDATE', id: pending.id })).ok).toBe(true);
    expect(fetch.mock.calls[1][1].body).toBe('num_watched_episodes=2');
    expect(mock.getLocal().pending).toEqual([]);
  });
  it('does not lower progress if MAL already has a higher count', async () => {
    await mock.browser.storage.local.set({
      pending: [{ id: '5:1:2', anime, episode: 2, previous: 1, createdAt: Date.now(), tabId: 1 }],
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        json({ ...anime, my_list_status: { ...anime.my_list_status, num_episodes_watched: 8 } }),
      );
    vi.stubGlobal('fetch', fetch);
    expect((await message({ type: 'APPROVE_UPDATE', id: '5:1:2' })).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('leaves failed updates queued for retry', async () => {
    await mock.browser.storage.local.set({
      pending: [{ id: '5:1:2', anime, episode: 2, previous: 1, createdAt: Date.now(), tabId: 1 }],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, 503)));
    expect((await message({ type: 'APPROVE_UPDATE', id: '5:1:2' })).ok).toBe(false);
    expect(mock.getLocal().pending).toHaveLength(1);
  });
  it('refuses to create a removed entry via a progress update', async () => {
    await mock.browser.storage.local.set({
      pending: [{ id: '5:1:2', anime, episode: 2, previous: 1, createdAt: Date.now(), tabId: 1 }],
    });
    const fetch = vi.fn().mockResolvedValue(json({ ...anime, my_list_status: undefined }));
    vi.stubGlobal('fetch', fetch);
    expect((await message({ type: 'APPROVE_UPDATE', id: '5:1:2' })).ok).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('clears account state on logout while preserving matches and settings', async () => {
    await mock.browser.storage.local.set({
      mappings: [{ id: 'rule' }],
      pending: [{ id: 'pending' }],
    });
    await mock.browser.storage.session.set({ 'tab:1': session() });
    expect((await message({ type: 'LOGOUT' })).ok).toBe(true);
    expect(mock.getLocal().auth).toBeUndefined();
    expect(mock.getLocal().pending).toBeUndefined();
    expect(mock.getLocal().mappings).toHaveLength(1);
    expect(mock.getSession()).toEqual({});
  });
  it('cannot apply another account’s queued update', async () => {
    await mock.browser.storage.local.set({
      pending: [
        { id: 'other-user:1:2', anime, episode: 2, previous: 1, createdAt: Date.now(), tabId: 1 },
      ],
    });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect((await message({ type: 'APPROVE_UPDATE', id: 'other-user:1:2' })).ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
});
describe('website setup authorization', () => {
  it('does not enable arbitrary or retired domains from a host grant alone', async () => {
    mock.browser.permissions.contains.mockResolvedValue(true);
    expect(await supportedUrl('https://aniwatch.co.at/watch/show')).toBe(false);
    expect(await supportedUrl('https://www.netflix.com/watch/81234567')).toBe(false);
    expect(await supportedUrl('https://www.crunchyroll.com/watch/ABC/episode')).toBe(true);
  });
  it('revokes unused legacy access without changing the MAL account or saved matches', async () => {
    mock.browser.permissions.remove.mockClear();
    await mock.browser.storage.local.set({ mappings: [{ id: 'saved-match' }] });
    await retireLegacyAccess();
    expect(mock.browser.permissions.remove).toHaveBeenCalledWith({
      origins: ['https://aniwatch.co.at/*', 'https://*.aniwatch.co.at/*'],
    });
    expect(mock.getLocal().auth).toEqual(auth);
    expect(mock.getLocal().mappings).toEqual([{ id: 'saved-match' }]);
  });
  it('preserves custom selector setups users explicitly saved on the retired domain', async () => {
    mock.browser.permissions.remove.mockClear();
    const custom = {
      id: 'chosen',
      origin: 'https://aniwatch.co.at',
      titleSelector: '#title',
      episodeSelector: '#episode',
      createdAt: 1,
    };
    await mock.browser.storage.local.set({ sites: [custom] });
    mock.browser.permissions.contains.mockResolvedValue(true);
    await retireLegacyAccess();
    expect(mock.browser.permissions.remove).not.toHaveBeenCalled();
    expect(await supportedUrl(custom.origin + '/watch/show')).toBe(true);
    expect(mock.getLocal().sites).toEqual([custom]);
  });
  it('hides and clears old automatic sessions when upgrading without losing confirmations', async () => {
    const old = {
      ...session(),
      detection: { ...detection, site: 'aniwatch', url: 'https://aniwatch.co.at/watch/show' },
    };
    mock.browser.tabs.get.mockResolvedValue({ id: 1, url: old.detection.url });
    await mock.browser.storage.session.set({ 'tab:1': old, 'tab:2': session() });
    await mock.browser.storage.local.set({
      pending: [{ id: '5:1:2', anime, episode: 2, previous: 1, createdAt: Date.now(), tabId: 1 }],
    });
    const state = await message<{ session?: WatchSession }>({ type: 'GET_STATE', tabId: 1 });
    expect(state.ok && state.data.session).toBeUndefined();
    await installed();
    expect(mock.getSession()['tab:1']).toBeUndefined();
    expect(mock.getSession()['tab:2']).toBeDefined();
    expect(mock.getLocal().pending).toHaveLength(1);
    expect(mock.getLocal().auth).toEqual(auth);
  });
  it('rejects selector saves without a user-initiated setup nonce', async () => {
    expect(
      (
        await message(
          { type: 'SAVE_SITE_CONFIG', nonce: 'fake', titleSelector: 'h1', episodeSelector: 'b' },
          content,
        )
      ).ok,
    ).toBe(false);
    expect(mock.getLocal().sites).toBeUndefined();
  });
  it('requires access to the exact domain before starting setup', async () => {
    const denied = await message({ type: 'START_SETUP', tabId: 1 });
    expect(denied.ok).toBe(false);
    mock.browser.permissions.contains.mockResolvedValue(true);
    const allowed = await message({ type: 'START_SETUP', tabId: 1 });
    expect(allowed.ok).toBe(true);
    expect(mock.browser.tabs.sendMessage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ type: 'START_PICKER' }),
      { frameId: 0 },
    );
  });
  it('saves only the selected domain’s config and consumes its nonce', async () => {
    mock.browser.permissions.contains.mockResolvedValue(true);
    await mock.browser.storage.session.set({
      'setup:1': {
        nonce: 'ok',
        origin: 'https://www.crunchyroll.com',
        expiresAt: Date.now() + 60000,
      },
    });
    const response = await message(
      {
        type: 'SAVE_SITE_CONFIG',
        nonce: 'ok',
        titleSelector: '#anime',
        episodeSelector: '#episode',
      },
      content,
    );
    expect(response.ok).toBe(true);
    expect(mock.getLocal().sites).toEqual([
      expect.objectContaining({
        origin: 'https://www.crunchyroll.com',
        titleSelector: '#anime',
        episodeSelector: '#episode',
      }),
    ]);
    expect(mock.getSession()['setup:1']).toBeUndefined();
    expect(mock.browser.scripting.registerContentScripts).toHaveBeenCalledWith([
      expect.objectContaining({ matches: ['https://www.crunchyroll.com/*'] }),
    ]);
  });
  it('rejects a save after navigating to another origin', async () => {
    mock.browser.permissions.contains.mockResolvedValue(true);
    await mock.browser.storage.session.set({
      'setup:1': {
        nonce: 'ok',
        origin: 'https://different.example',
        expiresAt: Date.now() + 60000,
      },
    });
    expect(
      (
        await message(
          { type: 'SAVE_SITE_CONFIG', nonce: 'ok', titleSelector: 'h1', episodeSelector: 'b' },
          content,
        )
      ).ok,
    ).toBe(false);
  });
  it('ignores custom-domain tracking after permission is revoked', async () => {
    const origin = 'https://custom.example';
    await mock.browser.storage.local.set({
      sites: [{ id: '1', origin, titleSelector: 'h1', episodeSelector: 'b', createdAt: 1 }],
    });
    mock.browser.tabs.get.mockResolvedValue({ id: 1, url: origin + '/watch' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await message(
      {
        type: 'DETECTION',
        detection: { ...detection, site: 'custom', url: origin + '/watch' },
        pageUrl: origin + '/watch',
        frameOrigins: [],
      },
      { ...content, url: origin + '/watch' },
    );
    expect(mock.getSession()).toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });
});
