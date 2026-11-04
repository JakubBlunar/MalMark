import { useId, useState } from 'react';
import { Languages } from 'lucide-react';
import { languages, isLanguagePreference } from '../../../shared/localization';
import { useLanguagePreference } from '../../i18n';

export function LanguagePicker({
  compact = false,
  welcome = false,
}: {
  compact?: boolean;
  welcome?: boolean;
}) {
  const { t, preference, setLanguage } = useLanguagePreference();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  function save(next: typeof preference) {
    setBusy(true);
    setError('');
    void setLanguage(next)
      .catch(() => setError('Could not change language. Try again.'))
      .finally(() => setBusy(false));
  }
  return (
    <div className={`language-picker ${compact ? 'compact' : ''}`}>
      <label htmlFor={id}>
        <Languages size={16} />
        {t('Language')}
      </label>
      <select
        id={id}
        value={preference}
        disabled={busy}
        aria-busy={busy}
        onChange={(event) => {
          const next = event.target.value;
          if (!isLanguagePreference(next)) return;
          save(next);
        }}
      >
        <option value="auto">{t('Automatic (device language)')}</option>
        {languages.map(({ code, name }) => (
          <option key={code} value={code} lang={code}>
            {name}
          </option>
        ))}
      </select>
      {!compact && (
        <p className="helper">
          {t(
            'Uses your device’s preferred language when available, or English. Your choice is saved on this device.',
          )}
        </p>
      )}
      {welcome && (
        <button className="button secondary wide" disabled={busy} onClick={() => save(preference)}>
          {t('Continue')}
        </button>
      )}
      {error && (
        <p role="alert" className="inline-error">
          {t(error)}
        </p>
      )}
    </div>
  );
}
