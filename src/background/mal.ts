import browser from 'webextension-polyfill';
import type { Anime, Auth, ListStatus, Profile } from '../shared/types';
import { getAuth, getLoginClientId } from './storage';
import { OAUTH_SETUP_REQUIRED } from '../shared/config';

export const API = 'https://api.myanimelist.net/v2';
const TOKEN_URL = 'https://myanimelist.net/v1/oauth2/token';

export class MalError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(20000),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw new Error('Could not reach MyAnimeList. Check your connection and try again.');
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      { error?: unknown } | undefined;
    const code =
      typeof payload?.error === 'string' && /^[a-z_]{1,50}$/.test(payload.error)
        ? payload.error
        : undefined;
    const messages: Record<number, string> = {
      400: 'MyAnimeList could not process this request. Please try again.',
      401: 'Your MyAnimeList session expired. Please connect again.',
      403: 'MyAnimeList denied this request. Check your app access or try again later.',
      404: 'This anime could not be found on MyAnimeList.',
      429: 'MyAnimeList is receiving too many requests. Please try again in a moment.',
    };
    throw new MalError(
      messages[response.status] ||
        `MyAnimeList returned an error (${response.status}). Try again later.`,
      response.status,
      code,
    );
  }
  return response.json() as Promise<T>;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export async function exchangeToken(body: URLSearchParams): Promise<Auth> {
  let token: TokenResponse;
  try {
    token = await fetchJson<TokenResponse>(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
  } catch (error) {
    if (error instanceof MalError && (error.status === 401 || error.code === 'invalid_client'))
      throw new MalError(
        'MyAnimeList could not authenticate Malmark’s app registration. Please update Malmark or contact its developer.',
        error.status,
        error.code,
      );
    if (error instanceof MalError && error.code === 'invalid_grant')
      throw new MalError(
        'This MyAnimeList sign-in attempt expired or could not be verified. Click Connect MyAnimeList again to start a fresh sign-in.',
        error.status,
        error.code,
      );
    throw error;
  }
  if (!token.access_token || !token.refresh_token || !Number.isFinite(token.expires_in))
    throw new Error('MyAnimeList returned an invalid token response.');
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + token.expires_in * 1000,
    clientId: body.get('client_id')!,
  };
}

let refreshTask: Promise<Auth> | undefined;
async function refresh(auth: Auth): Promise<Auth> {
  if (refreshTask) return refreshTask;
  refreshTask = (async () => {
    try {
      const fresh = await exchangeToken(
        new URLSearchParams({
          client_id: auth.clientId,
          grant_type: 'refresh_token',
          refresh_token: auth.refreshToken,
        }),
      );
      const current = await getAuth();
      if (!current || current.refreshToken !== auth.refreshToken)
        throw new Error('Account changed. Please try again.');
      fresh.profile = auth.profile;
      await browser.storage.local.set({ auth: fresh });
      return fresh;
    } catch (error) {
      if (error instanceof MalError && (error.status === 400 || error.status === 401)) {
        const current = await getAuth();
        if (current?.refreshToken === auth.refreshToken) await browser.storage.local.remove('auth');
        throw new Error('Your MyAnimeList session expired. Please connect again.');
      }
      throw error;
    }
  })().finally(() => {
    refreshTask = undefined;
  });
  return refreshTask;
}

export async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  let auth = await getAuth();
  if (!auth) throw new Error('Connect your MyAnimeList account first.');
  if (auth.expiresAt <= Date.now() + 60000) auth = await refresh(auth);
  try {
    return await fetchJson<T>(API + path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${auth.accessToken}` },
    });
  } catch (error) {
    if (retry && error instanceof MalError && error.status === 401) {
      await refresh(auth);
      return request<T>(path, init, false);
    }
    throw error;
  }
}

const fields = 'alternative_titles,num_episodes,status,media_type,start_season,my_list_status';

export async function searchAnime(query: string): Promise<Anime[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) throw new Error('Enter at least two characters to search.');
  const params = new URLSearchParams({ q, limit: '20', fields });
  return (await request<{ data: { node: Anime }[] }>(`/anime?${params}`)).data.map((a) => a.node);
}

export async function getAnime(id: number): Promise<Anime> {
  return request(`/anime/${id}?fields=${fields}`);
}

export async function updateAnime(
  id: number,
  values: { status?: ListStatus['status']; num_watched_episodes?: number; score?: number },
): Promise<ListStatus> {
  const body = new URLSearchParams(Object.entries(values).map(([k, v]) => [k, String(v)]));
  return request(`/anime/${id}/my_list_status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

export function randomString(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(48)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('');
}

export function authorizationUrl(
  clientId: string,
  redirect: string,
  verifier: string,
  state: string,
): string {
  return (
    'https://myanimelist.net/v1/oauth2/authorize?' +
    new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirect,
      code_challenge: verifier,
      code_challenge_method: 'plain',
      state,
    })
  );
}

export function authorizationCode(callback: string, redirect: string, state: string): string {
  const url = new URL(callback);
  const expected = new URL(redirect);
  if (
    url.origin !== expected.origin ||
    url.pathname !== expected.pathname ||
    url.searchParams.get('state') !== state
  )
    throw new Error('The sign-in response could not be verified. Please try again.');
  if (url.searchParams.has('error'))
    throw new Error('MyAnimeList authorization was cancelled or denied.');
  const code = url.searchParams.get('code');
  if (!code) throw new Error('MyAnimeList did not return an authorization code.');
  return code;
}

let authGeneration = 0;
let connecting = false;

export function cancelLogin(): void {
  authGeneration++;
}

export async function connect(): Promise<void> {
  if (connecting) throw new Error('A sign-in window is already open. Complete or close it first.');
  const generation = ++authGeneration;
  connecting = true;
  try {
    const clientId = await getLoginClientId();
    if (!clientId) throw new Error('Set up your MyAnimeList app before connecting.');
    const verifier = randomString();
    const state = randomString();
    const redirect = browser.identity.getRedirectURL();
    let callback: string;
    try {
      callback = await browser.identity.launchWebAuthFlow({
        url: authorizationUrl(clientId, redirect, verifier, state),
        interactive: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/authorization page could not be loaded/i.test(message))
        throw new Error(
          OAUTH_SETUP_REQUIRED
            ? 'MyAnimeList sign-in could not open. Check your client ID and register the exact redirect URL shown in API setup, then try again.'
            : 'MyAnimeList sign-in could not open. Please try again. If this keeps happening, update Malmark or contact its developer.',
        );
      throw error;
    }
    const code = authorizationCode(callback, redirect, state);
    const auth = await exchangeToken(
      new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
        redirect_uri: redirect,
      }),
    );
    auth.profile = await fetchJson<Profile>(API + '/users/@me?fields=anime_statistics', {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    if (generation !== authGeneration)
      throw new Error('Sign-in was cancelled because the account changed.');
    await browser.storage.local.set({ auth });
  } finally {
    connecting = false;
  }
}
