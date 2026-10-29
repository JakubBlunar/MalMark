import type { ViewProps } from '../types';
import { PreferencesForm } from '../components/settings/PreferencesForm';
import { PrivacyCard } from '../components/settings/PrivacyCard';

export function SettingsView({ state, busy, act }: ViewProps) {
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">YOUR PREFERENCES</span>
        <h1>Your settings.</h1>
        <p>Everything you need for a quieter watchlist.</p>
      </div>
      <PreferencesForm state={state} busy={busy} act={act} />
      <PrivacyCard permissions={state.playerPermissions} busy={busy} act={act} />
    </>
  );
}
