import { ArrowRight, ChevronRight, Search } from 'lucide-react';
import type { Anime } from '../../../shared/types';
import type { AnimeSearch } from '../../hooks/useAnimeSearch';
import { AnimeCover } from '../shared/AnimeCover';
import { Spinner } from '../shared/Spinner';

export function AnimeSearchResults({
  search,
  busy,
  onSelect,
}: {
  search: AnimeSearch;
  busy: string;
  onSelect: (anime: Anime) => void;
}) {
  return (
    <>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void search.submit();
        }}
      >
        <label htmlFor="anime-search">Search MyAnimeList</label>
        <div className="search-input">
          <Search size={17} />
          <input
            id="anime-search"
            required
            minLength={2}
            maxLength={100}
            value={search.query}
            onChange={(event) => search.setQuery(event.target.value)}
            placeholder="Anime title or season…"
          />
          <button disabled={search.searching || !!busy} aria-label="Search anime" type="submit">
            {search.searching ? <Spinner /> : <ArrowRight size={17} />}
          </button>
        </div>
      </form>
      {search.error && (
        <p role="alert" className="inline-error">
          {search.error}
        </p>
      )}
      {search.searched && !search.results.length && !search.searching && (
        <p className="helper callout">
          No results. Try the Japanese title or include the season number.
        </p>
      )}
      <div className="search-results">
        {search.results.map((anime) => (
          <button key={anime.id} className="search-result" onClick={() => onSelect(anime)}>
            <AnimeCover anime={anime} />
            <span>
              <b>{anime.title}</b>
              <small>
                {anime.alternative_titles?.en || 'MyAnimeList'} · {anime.start_season?.year || '—'}{' '}
                · {anime.num_episodes || '?'} ep
              </small>
            </span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    </>
  );
}
