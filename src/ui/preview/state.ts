import type { PublicState } from '../../shared/types';

export function previewState(): PublicState {
  const demo = new URLSearchParams(location.search).get('demo');
  const state: PublicState = {
    settings: { threshold: 65, minWatchSeconds: 60, showPrompts: true, promptAtEnd: true },
    oauth: {
      mode:
        new URLSearchParams(location.search).get('distribution') === 'store' ? 'store' : 'unpacked',
      clientId: '',
    },
    connected: false,
    redirectUrl: 'https://your-extension-id.chromiumapp.org/',
    pending: [],
    mappings: [],
    playerPermissions: [],
    sites: [],
    tabUrl: 'https://example.org/watch/episode-7',
  };
  if (demo !== 'watching' && demo !== 'pending' && demo !== 'unmatched') return state;
  const anime = {
    id: 52991,
    title: 'Sousou no Frieren',
    alternative_titles: { en: 'Frieren: Beyond Journey’s End' },
    num_episodes: 28,
    media_type: 'tv',
    start_season: { year: 2023, season: 'fall' },
    my_list_status: { status: 'watching' as const, num_episodes_watched: 6 },
  };
  state.connected = true;
  state.tabId = 1;
  state.profile = {
    id: 1,
    name: 'animefan',
    joined_at: '2020-09-01T00:00:00',
    anime_statistics: {
      num_items_watching: 8,
      num_items_completed: 124,
      num_episodes: 2184,
      num_days_watched: 36.4,
    },
  };
  state.session = {
    detection: {
      site: 'crunchyroll',
      title: 'Frieren: Beyond Journey’s End',
      url: 'https://www.crunchyroll.com/watch/EXAMPLE/like-a-fairy-tale',
      seriesKey: 'crunchyroll:FRIEREN:s1',
      episode: 7,
      season: 1,
    },
    anime: demo === 'unmatched' ? undefined : anime,
    match: demo === 'unmatched' ? 'unmatched' : 'matched',
    matchSource: 'automatic',
    episode: 7,
    progress: { ranges: [[0, 1012]], duration: 1440, watched: 1012, position: 1012 },
    frameOrigins: [],
    playerConnected: true,
    updatedAt: Date.now(),
  };
  if (demo === 'pending')
    state.pending = [
      { id: 'preview', anime, episode: 7, previous: 6, createdAt: Date.now(), tabId: 1 },
    ];
  return state;
}
