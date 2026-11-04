import { useTranslation } from 'react-i18next';
import type { ViewProps } from '../types';
import { PreferencesForm } from '../components/settings/PreferencesForm';
import { PrivacyCard } from '../components/settings/PrivacyCard';
import { ReleaseNotesCard } from '../components/settings/ReleaseNotesCard';
import { SignInCard } from '../components/watching/SignInCard';
import { LanguagePicker } from '../components/settings/LanguagePicker';

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
  const { t } = useTranslation();
  return (
    <>
      {state.connected && (
        <div className="page-title">
          <span className="eyebrow">{t('YOUR PREFERENCES')}</span>
          <h1>{t('Your settings.')}</h1>
          <p>{t('Everything you need for a quieter watchlist.')}</p>
        </div>
      )}
      {state.connected ? (
        <>
          <section className="card settings-section">
            <LanguagePicker />
          </section>
          <PreferencesForm state={state} busy={busy} act={act} />
        </>
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
