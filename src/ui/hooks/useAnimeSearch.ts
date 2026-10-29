import { useEffect, useRef, useState } from 'react';
import type { Anime } from '../../shared/types';
import { inExtension, request } from '../services/extension';

export function useAnimeSearch(title: string, identity: string) {
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<Anime[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const revision = useRef(0);

  function clearResults() {
    revision.current++;
    setResults([]);
    setSearched(false);
    setSearching(false);
    setError('');
  }

  useEffect(() => {
    clearResults();
    setQuery(title);
    return () => {
      revision.current++;
    };
  }, [title, identity]);

  async function submit() {
    const current = ++revision.current;
    setSearching(true);
    setError('');
    try {
      const data = inExtension ? await request<Anime[]>({ type: 'SEARCH', query }) : [];
      if (current !== revision.current) return;
      setResults(data);
      setSearched(true);
    } catch (error) {
      if (current === revision.current) setError((error as Error).message);
    } finally {
      if (current === revision.current) setSearching(false);
    }
  }

  return { query, setQuery, results, searched, searching, error, submit, clearResults };
}

export type AnimeSearch = ReturnType<typeof useAnimeSearch>;
