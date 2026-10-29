import { useState, useEffect, useRef, useCallback } from 'react';
import type { PublicState, Message } from '../../shared/types';
import type { View } from '../types';
import {
  activeTabId,
  inExtension,
  openSidebar,
  onActiveTabChange,
  onReviewRequest,
  request,
} from '../services/extension';
import { fullPage } from '../lib/surface';
import { previewState } from '../preview/state';

export function useAppController() {
  const [state, setState] = useState<PublicState>();
  const [view, setView] = useState<View>(
    (new URLSearchParams(location.search).get('view') as View) ||
      (fullPage ? 'settings' : 'watching'),
  );
  const [error, setError] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [tabId, setTabId] = useState<number>();
  const activeId = useRef<number | undefined>(undefined);
  const refreshRevision = useRef(0);

  const refresh = useCallback(async (id?: number) => {
    const revision = ++refreshRevision.current;
    if (!inExtension) {
      setState(previewState());
      return;
    }

    if (activeId.current !== id) {
      activeId.current = id;
      setTabId(id);
      setState(
        (previous) => previous && { ...previous, session: undefined, tabUrl: undefined, tabId: id },
      );
      setError('');
      setNotice('');
    }
    const snapshot = await request<PublicState>({ type: 'GET_STATE', tabId: id });
    if (revision !== refreshRevision.current) return;
    setTabId(id);
    setState(snapshot);
    setConnectionError('');
  }, []);

  useEffect(() => {
    let mounted = true;
    let revision = 0;
    const sync = async () => {
      const current = ++revision;
      try {
        const id = inExtension ? await activeTabId() : undefined;
        if (!mounted || current !== revision) return;
        await refresh(id);
      } catch (e) {
        if (mounted && current === revision) setConnectionError((e as Error).message);
      }
    };
    void sync();
    if (!inExtension)
      return () => {
        mounted = false;
      };
    // Poll the compact snapshot while open; no MAL network calls are made by GET_STATE.
    const timer = window.setInterval(() => void sync(), 2000);
    const unsubscribe = onActiveTabChange(() => void sync());
    const unsubscribeReview = onReviewRequest((id) => {
      if (activeId.current === id) {
        setView('watching');
        setError('');
        setNotice('');
      }
    });
    return () => {
      mounted = false;
      refreshRevision.current++;
      clearInterval(timer);
      unsubscribe();
      unsubscribeReview();
    };
  }, [refresh]);

  async function retryConnection(): Promise<void> {
    setBusy('retry');
    try {
      const id = await activeTabId();
      await refresh(id);
    } catch (e) {
      setConnectionError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  async function act(
    key: string,
    task: Message | (() => Promise<unknown>),
    success = '',
  ): Promise<boolean> {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      if (!inExtension) {
        setNotice('Browser preview · Load the built extension to use this action.');
        return false;
      }
      if (typeof task === 'function') await task();
      else await request(task);
      await refresh(await activeTabId());
      if (success) setNotice(success);
      return true;
    } catch (e) {
      setError((e as Error).message);
      await activeTabId()
        .then(refresh)
        .catch(() => undefined);
      return false;
    } finally {
      setBusy('');
    }
  }

  const go = (next: View) => {
    setView(next);
    setError('');
    setNotice('');
  };

  async function signIn(): Promise<void> {
    if (await act('connect', { type: 'CONNECT' })) go('watching');
  }

  async function showSidebar(): Promise<void> {
    if (await act('sidebar', () => openSidebar(tabId))) {
      if (location.pathname.endsWith('popup.html')) window.close();
    }
  }

  const activeView = state?.connected ? view : 'watching';
  return {
    state,
    view,
    activeView,
    error,
    notice,
    busy,
    tabId,
    connectionError,
    act,
    go,
    signIn,
    showSidebar,
    retryConnection,
    setError,
    setNotice,
  };
}
