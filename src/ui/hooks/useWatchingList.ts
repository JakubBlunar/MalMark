import { t } from '../../shared/i18n';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchingListPage } from '../../shared/types';
import { inExtension, request } from '../services/extension';
import { previewWatchingList } from '../preview/state';

export function useWatchingList(accountId?: number) {
  const [data, setData] = useState<WatchingListPage>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; offset: number }>();
  const revision = useRef(0);
  const load = useCallback(
    async (offset = 0) => {
      if (accountId === undefined) return;
      const current = ++revision.current;
      setLoading(true);
      setError(undefined);
      try {
        const page = inExtension
          ? await request<WatchingListPage>({ type: 'GET_WATCHING_LIST', offset })
          : previewWatchingList(accountId);
        if (current !== revision.current || page.accountId !== accountId) return;
        setData((previous) => ({
          ...page,
          items:
            offset && previous?.accountId === accountId
              ? [
                  ...new Map(
                    [...previous.items, ...page.items].map((anime) => [anime.id, anime]),
                  ).values(),
                ]
              : page.items,
        }));
      } catch (error) {
        if (current === revision.current)
          setError({
            message: error instanceof Error ? error.message : t('Could not load your list.'),
            offset,
          });
      } finally {
        if (current === revision.current) setLoading(false);
      }
    },
    [accountId],
  );
  useEffect(() => {
    setData(undefined);
    void load();
    return () => {
      revision.current++;
    };
  }, [load]);
  return { data: data?.accountId === accountId ? data : undefined, loading, error, load };
}
