import { inExtension } from './services/extension';
import { AppHeader } from './components/layout/AppHeader';
import { AppNavigation } from './components/layout/AppNavigation';
import { AppFooter } from './components/layout/AppFooter';
import { ConnectionError, LoadingState } from './components/feedback/ConnectionState';
import { Notice } from './components/feedback/Notice';
import { useAppController } from './hooks/useAppController';
import { WatchingView } from './views/WatchingView';
import { MatchesView } from './views/MatchesView';
import { SitesView } from './views/SitesView';
import { SettingsView } from './views/SettingsView';
import { ProfileView } from './views/ProfileView';

export function App() {
  const {
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
  } = useAppController();
  return (
    <div className="app-shell">
      <AppHeader
        connected={!!state?.connected}
        profile={state?.profile}
        view={view}
        go={go}
        busy={busy}
        tabId={tabId}
        showSidebar={showSidebar}
        act={act}
        url={state?.tabUrl}
      />
      <div className={`app-layout ${state?.connected ? '' : 'signed-out'}`}>
        {state?.connected && (
          <AppNavigation view={view} go={go} pendingCount={state.pending.length} />
        )}
        <main>
          {!inExtension && (
            <div className="preview-banner">
              LOCAL UI PREVIEW <span>Extension actions are disabled</span>
            </div>
          )}
          {error && <Notice message={error} variant="error" onDismiss={() => setError('')} />}
          {notice && <Notice message={notice} variant="success" onDismiss={() => setNotice('')} />}
          {!state ? (
            connectionError ? (
              <ConnectionError error={connectionError} busy={busy} onRetry={retryConnection} />
            ) : (
              <LoadingState />
            )
          ) : (
            <>
              {activeView === 'watching' && (
                <WatchingView
                  state={state}
                  tabId={tabId}
                  busy={busy}
                  act={act}
                  go={go}
                  signIn={signIn}
                />
              )}
              {activeView === 'matches' && (
                <MatchesView state={state} tabId={tabId} busy={busy} act={act} />
              )}
              {activeView === 'sites' && (
                <SitesView state={state} tabId={tabId} busy={busy} act={act} />
              )}
              {activeView === 'settings' && <SettingsView state={state} busy={busy} act={act} />}
              {activeView === 'profile' && (
                <ProfileView state={state} busy={busy} act={act} signIn={signIn} />
              )}
            </>
          )}
        </main>
      </div>
      <AppFooter />
    </div>
  );
}
