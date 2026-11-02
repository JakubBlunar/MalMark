import { ExternalLink, ListVideo, RefreshCw } from 'lucide-react';
import type { ViewProps } from '../types';
import { useWatchingList } from '../hooks/useWatchingList';
import { AnimeCover } from '../components/shared/AnimeCover';
import { Spinner } from '../components/shared/Spinner';

export function MyListView({ state }: Pick<ViewProps, 'state'>) {
  const { data, loading, error, load } = useWatchingList(state.profile?.id);
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">ONE MORE EPISODE</span>
        <h1>Currently watching</h1>
        <p>Your MyAnimeList progress, ready when you are.</p>
      </div>
      <div className="my-list-toolbar">
        {state.profile?.name && (
          <a
            className="text-button"
            target="_blank"
            rel="noreferrer"
            href={`https://myanimelist.net/animelist/${encodeURIComponent(state.profile.name)}`}
          >
            Full list on MAL <ExternalLink size={13} />
          </a>
        )}
        <button className="text-button" disabled={loading} onClick={() => void load()}>
          {loading ? <Spinner /> : <RefreshCw size={14} />} Refresh
        </button>
      </div>
      {error && (
        <div className="callout" role="alert">
          <p>{error.message}</p>
          <button
            className="text-button"
            disabled={loading}
            onClick={() => void load(error.offset)}
          >
            Try again
          </button>
        </div>
      )}
      {loading && (
        <p className="helper" role="status">
          Loading your watching list…
        </p>
      )}
      {data && (
        <>
          <div className="list-heading">
            <h2>Your anime</h2>
            <span>
              {data.items.length} {data.nextOffset !== undefined ? 'LOADED' : 'WATCHING'}
            </span>
          </div>
          {!data.items.length && (
            <div className="card compact-empty">
              <ListVideo size={26} />
              <h3>A new story is waiting.</h3>
              <p>Anime marked Watching on MyAnimeList will appear here.</p>
            </div>
          )}
          <div className="my-list-items">
            {data.items.map((anime) => {
              const watched = anime.my_list_status?.num_episodes_watched ?? 0;
              const total = anime.num_episodes || 0;
              const english = anime.alternative_titles?.en?.trim();
              const title = english || anime.title;
              return (
                <a
                  key={anime.id}
                  className="card my-list-item"
                  href={`https://myanimelist.net/anime/${anime.id}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`${title}, ${watched} of ${total || 'unknown'} episodes`}
                >
                  <AnimeCover anime={anime} lazy />
                  <div className="my-list-copy">
                    <h3>{title}</h3>
                    {english && anime.title !== title && (
                      <p className="my-list-original">{anime.title}</p>
                    )}
                    <p className="my-list-count">
                      <b>{watched}</b> / {total || '?'} episodes
                    </p>
                    {total > 0 && (
                      <progress
                        value={Math.min(watched, total)}
                        max={total}
                        aria-label={`${title} watch progress`}
                      />
                    )}
                    <small>
                      {anime.my_list_status?.is_rewatching ? 'Rewatching · ' : ''}
                      {total && watched >= total
                        ? 'All episodes logged'
                        : `Next: episode ${watched + 1}`}
                    </small>
                  </div>
                  <ExternalLink className="my-list-external" size={14} />
                </a>
              );
            })}
          </div>
          {data.nextOffset !== undefined && (
            <button
              className="button secondary wide"
              disabled={loading}
              onClick={() => void load(data.nextOffset)}
            >
              Load more
            </button>
          )}
          {!!data.items.length && (
            <p className="helper centered">
              Recently updated first · Progress saved on MyAnimeList
            </p>
          )}
        </>
      )}
    </>
  );
}
