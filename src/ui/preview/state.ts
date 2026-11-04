import type { PublicState, WatchingListPage } from '../../shared/types';

export function previewWatchingList(accountId: number): WatchingListPage {
  return {
    accountId,
    items: [
      {
        id: 52991,
        title: 'Sousou no Frieren',
        alternative_titles: { en: 'Frieren: Beyond Journey’s End' },
        num_episodes: 28,
        my_list_status: { status: 'watching', num_episodes_watched: 6 },
      },
      {
        id: 31240,
        title: 'Re:Zero kara Hajimeru Isekai Seikatsu',
        alternative_titles: { en: 'Re:ZERO -Starting Life in Another World-' },
        num_episodes: 25,
        my_list_status: { status: 'watching', num_episodes_watched: 17, is_rewatching: true },
      },
      {
        id: 21,
        title: 'One Piece',
        num_episodes: 0,
        my_list_status: { status: 'watching', num_episodes_watched: 1122 },
      },
    ],
  };
}

export function previewState(): PublicState {
  const demo = new URLSearchParams(location.search).get('demo');
  const state: PublicState = {
    releaseNotesUnread: new URLSearchParams(location.search).get('updated') === '1',
    settings: {
      autoProgress: false,
      autoFinishDate: false,
      threshold: 65,
      minWatchSeconds: 60,
      showPrompts: true,
      promptAtEnd: true,
    },
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
  if (!['watching', 'pending', 'unmatched', 'finished', 'finale'].includes(demo ?? ''))
    return state;
  const anime = {
    id: 52991,
    title: 'Sousou no Frieren',
    alternative_titles: { en: 'Frieren: Beyond Journey’s End' },
    num_episodes: 28,
    status: 'finished_airing' as const,
    media_type: 'tv',
    start_season: { year: 2023, season: 'fall' },
    my_list_status: {
      status: 'watching' as const,
      num_episodes_watched: demo === 'finished' ? 28 : demo === 'finale' ? 27 : 6,
      score: demo === 'finished' || demo === 'finale' ? 8 : 0,
    },
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
      episode: demo === 'finished' || demo === 'finale' ? 28 : 7,
      season: 1,
    },
    anime: demo === 'unmatched' ? undefined : anime,
    match: demo === 'unmatched' ? 'unmatched' : 'matched',
    matchSource: 'automatic',
    episode: demo === 'finished' || demo === 'finale' ? 28 : 7,
    progress: { ranges: [[0, 1012]], duration: 1440, watched: 1012, position: 1012 },
    frameOrigins: [],
    playerConnected: true,
    updatedAt: Date.now(),
  };
  if (demo === 'pending' || demo === 'finale')
    state.pending = [
      {
        id: 'preview',
        anime,
        episode: demo === 'finale' ? 28 : 7,
        previous: demo === 'finale' ? 27 : 6,
        createdAt: Date.now(),
        tabId: 1,
      },
    ];
  return state;
}
