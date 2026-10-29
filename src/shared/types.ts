export type Site = 'crunchyroll' | 'custom';

export interface SiteConfig {
  id: string;
  origin: string;
  titleSelector: string;
  episodeSelector: string;
  createdAt: number;
}

export interface Detection {
  site: Site;
  url: string;
  seriesKey: string;
  title: string;
  episode: number | null;
  season: number | null;
}

export interface ListStatus {
  status: 'watching' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_watch';
  num_episodes_watched: number;
  score?: number;
  is_rewatching?: boolean;
  finish_date?: string | null;
}

export interface Anime {
  id: number;
  title: string;
  main_picture?: { medium: string; large?: string };
  alternative_titles?: { en?: string; ja?: string; synonyms?: string[] };
  num_episodes?: number;
  status?: 'finished_airing' | 'currently_airing' | 'not_yet_aired';
  media_type?: string;
  start_season?: { year: number; season: string };
  my_list_status?: ListStatus;
}

export interface Profile {
  id: number;
  name: string;
  picture?: string;
  location?: string;
  joined_at?: string;
  anime_statistics?: {
    num_items_watching: number;
    num_items_completed: number;
    num_episodes: number;
    num_days_watched: number;
  };
}

export interface Settings {
  autoProgress: boolean;
  autoFinishDate: boolean;
  threshold: number;
  minWatchSeconds: number;
  showPrompts: boolean;
  promptAtEnd: boolean;
}

export interface Mapping {
  id: string;
  prefix: string;
  seriesKey: string;
  season: number | null;
  animeId: number;
  animeTitle: string;
  episodeOffset: number;
  createdAt: number;
}

export interface Playback {
  videoId: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  ended: boolean;
  rate: number;
  sentAt: number;
}

export interface WatchProgress {
  ranges: [number, number][];
  watched: number;
  duration: number;
  position: number;
  last?: Playback;
  frameId?: number;
}

export interface WatchSession {
  detection: Detection;
  anime?: Anime;
  match: 'searching' | 'matched' | 'unmatched' | 'signed-out';
  matchSource?: 'automatic' | 'manual';
  episode: number | null;
  episodeOverride?: number;
  progress: WatchProgress;
  frameOrigins: string[];
  playerConnected: boolean;
  error?: string;
  updatedAt: number;
}

export interface PendingUpdate {
  id: string;
  anime: Anime;
  episode: number;
  previous: number;
  createdAt: number;
  deferred?: boolean;
  error?: string;
  tabId: number;
}

export interface ProgressNotice {
  id: string;
  title: string;
  episode: number;
  expiresAt: number;
}

export interface Auth {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  clientId: string;
  profile?: Profile;
}

export interface PublicState {
  settings: Settings;
  oauth: { mode: 'unpacked' | 'store'; clientId: string };
  profile?: Profile;
  connected: boolean;
  redirectUrl: string;
  tabId?: number;
  session?: WatchSession;
  pending: PendingUpdate[];
  mappings: Mapping[];
  playerPermissions: string[];
  sites: SiteConfig[];
  tabUrl?: string;
}

export type Message =
  | SetupMessage
  | { type: 'DETECTION'; detection: Detection | null; pageUrl: string; frameOrigins: string[] }
  | { type: 'PLAYBACK'; playback: Playback; pageUrl: string }
  | { type: 'GET_STATE'; tabId?: number }
  | { type: 'CONNECT' }
  | { type: 'SAVE_OAUTH_CLIENT'; clientId: string }
  | { type: 'LOGOUT' }
  | { type: 'SAVE_SETTINGS'; settings: Settings }
  | { type: 'SEARCH'; query: string }
  | { type: 'SAVE_MAPPING'; tabId: number; animeId: number; prefix: string; episodeOffset: number }
  | { type: 'REMOVE_MAPPING'; id: string }
  | { type: 'SET_EPISODE'; tabId: number; episode: number }
  | { type: 'SET_WATCHED'; animeId: number; episode: number; expectedPrevious: number }
  | {
      type: 'COMPLETE_ANIME';
      animeId: number;
      expectedEpisodes: number;
      score?: number;
      pendingId?: string;
    }
  | { type: 'ADD_WATCHING'; tabId: number }
  | { type: 'APPROVE_UPDATE'; id: string }
  | { type: 'DISMISS_UPDATE'; id: string }
  | { type: 'RECHECK'; tabId: number }
  | { type: 'INJECT_PLAYERS'; tabId: number }
  | { type: 'PROMPT_STATE' }
  | { type: 'GET_INLINE_PROMPT'; nonce: string }
  | { type: 'INLINE_PROMPT_SIZE'; nonce: string; height: number }
  | { type: 'INLINE_PROMPT_ACTION'; nonce: string; action: 'approve' | 'later' }
  | { type: 'OPEN_EXTENSION' };

export type SetupMessage =
  | { type: 'GET_SITE_CONFIG' }
  | { type: 'START_SETUP'; tabId: number }
  | { type: 'SAVE_SITE_CONFIG'; nonce: string; titleSelector: string; episodeSelector: string }
  | { type: 'REMOVE_SITE_CONFIG'; id: string };

export type Reply<T> = { ok: true; data: T } | { ok: false; error: string };
