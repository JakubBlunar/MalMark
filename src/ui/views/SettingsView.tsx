import type { ViewProps } from '../types';
import { PreferencesForm } from '../components/settings/PreferencesForm';
import { PrivacyCard } from '../components/settings/PrivacyCard';
import { ReleaseNotesCard } from '../components/settings/ReleaseNotesCard';
import { SignInCard } from '../components/watching/SignInCard';

export function SettingsView({
  state,
  busy,
  act,
  signIn,
  notesRequest,
  readReleaseNotes,
}: ViewProps & {
  signIn: () => Promise<void>;
  notesRequest: number;
  readReleaseNotes: () => Promise<void>;
}) {
  return (
    <>
      {state.connected && (
        <div className="page-title">
          <span className="eyebrow">YOUR PREFERENCES</span>
          <h1>Your settings.</h1>
          <p>Everything you need for a quieter watchlist.</p>
        </div>
      )}
      {state.connected ? (
        <PreferencesForm state={state} busy={busy} act={act} />
      ) : (
        <SignInCard
          session={state.session}
          busy={busy}
          signIn={signIn}
          oauth={state.oauth}
          redirectUrl={state.redirectUrl}
          act={act}
        />
      )}
      <ReleaseNotesCard
        unread={!!state.releaseNotesUnread}
        openRequest={notesRequest}
        onRead={readReleaseNotes}
      />
      <PrivacyCard permissions={state.playerPermissions} busy={busy} act={act} />
    </>
  );
}
