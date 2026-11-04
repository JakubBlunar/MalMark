import { useTranslation } from 'react-i18next';
import { ExternalLink, ListVideo, RefreshCw } from 'lucide-react';
import type { ViewProps } from '../types';
import { useWatchingList } from '../hooks/useWatchingList';
import { AnimeCover } from '../components/shared/AnimeCover';
import { Spinner } from '../components/shared/Spinner';

export function MyListView({ state }: Pick<ViewProps, 'state'>) {
  const { t } = useTranslation();
  const { data, loading, error, load } = useWatchingList(state.profile?.id);
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">{t('ONE MORE EPISODE')}</span>
        <h1>{t('Currently watching')}</h1>
        <p>{t('Your MyAnimeList progress, ready when you are.')}</p>
      </div>
      <div className="my-list-toolbar">
        {state.profile?.name && (
          <a
            className="text-button"
            target="_blank"
            rel="noreferrer"
            href={`https://myanimelist.net/animelist/${encodeURIComponent(state.profile.name)}`}
          >
            {t('Full list on MAL')} <ExternalLink size={13} />
          </a>
        )}
        <button className="text-button" disabled={loading} onClick={() => void load()}>
          {loading ? <Spinner /> : <RefreshCw size={14} />} {t('Refresh')}
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
            {t('Try again')}
          </button>
        </div>
      )}
      {loading && (
        <p className="helper" role="status">
          {t('Loading your watching list…')}
        </p>
      )}
      {data && (
        <>
          <div className="list-heading">
            <h2>{t('Your anime')}</h2>
            <span>
              {data.items.length} {data.nextOffset !== undefined ? t('LOADED') : t('WATCHING')}
            </span>
          </div>
          {!data.items.length && (
            <div className="card compact-empty">
              <ListVideo size={26} />
              <h3>{t('A new story is waiting.')}</h3>
              <p>{t('Anime marked Watching on MyAnimeList will appear here.')}</p>
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
                  aria-label={t('{{title}}, {{watched}} of {{total}} episodes', {
                    title,
                    watched,
                    total: total || t('unknown'),
                  })}
                >
                  <AnimeCover anime={anime} lazy />
                  <div className="my-list-copy">
                    <h3>{title}</h3>
                    {english && anime.title !== title && (
                      <p className="my-list-original">{anime.title}</p>
                    )}
                    <p className="my-list-count">
                      <b>{watched}</b> / {total || '?'} {t('episodes', { count: total || 5 })}
                    </p>
                    {total > 0 && (
                      <progress
                        value={Math.min(watched, total)}
                        max={total}
                        aria-label={t('{{title}} watch progress', { title })}
                      />
                    )}
                    <small>
                      {anime.my_list_status?.is_rewatching ? t('Rewatching · ') : ''}
                      {total && watched >= total
                        ? t('All episodes logged')
                        : t('Next: episode {{episode}}', { episode: watched + 1 })}
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
              {t('Load more')}
            </button>
          )}
          {!!data.items.length && (
            <p className="helper centered">
              {t('Recently updated first · Progress saved on MyAnimeList')}
            </p>
          )}
        </>
      )}
    </>
  );
}
