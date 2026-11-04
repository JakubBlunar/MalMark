import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { ArrowRight, Copy, ExternalLink } from 'lucide-react';
import type { Act } from '../../types';
import { Spinner } from '../shared/Spinner';

export function OAuthSetupForm({
  clientId: savedId,
  redirectUrl,
  busy,
  act,
  onSaved,
  onCancel,
}: {
  clientId: string;
  redirectUrl: string;
  busy: string;
  act: Act;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [clientId, setClientId] = useState(savedId);
  const [copyLabel, setCopyLabel] = useState(t('Copy redirect URL'));
  return (
    <form
      className="oauth-setup"
      onSubmit={async (event) => {
        event.preventDefault();
        if (await act('oauth-setup', { type: 'SAVE_OAUTH_CLIENT', clientId })) onSaved();
      }}
    >
      <ol className="oauth-steps">
        <li>
          <a href="https://myanimelist.net/apiconfig" target="_blank" rel="noreferrer">
            {t('Create a MAL API app')} <ExternalLink size={12} />
          </a>
          <span>
            {t('Choose app type')} <b>{t('Other')}</b>
            {t('. This extension uses a public client ID.')}
          </span>
        </li>
        <li>
          <label htmlFor="oauth-redirect">{t('Register this exact redirect URL')}</label>
          <div className="button-row">
            <input
              id="oauth-redirect"
              value={redirectUrl}
              readOnly
              spellCheck={false}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="icon-button"
              title={copyLabel}
              aria-label={copyLabel}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(redirectUrl);
                  setCopyLabel(t('Copied redirect URL'));
                } catch {
                  setCopyLabel(t('Select the URL and copy it manually'));
                }
              }}
            >
              <Copy size={16} />
            </button>
          </div>
          <span>
            {t(
              'Use the URL from this installation. If you move its folder, check it again before signing in.',
            )}
          </span>
        </li>
        <li>
          <label htmlFor="oauth-client">{'MAL Client ID'}</label>
          <input
            id="oauth-client"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder={t('Paste your app’s client ID')}
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={128}
          />
        </li>
      </ol>
      <button
        className="button primary wide"
        disabled={!!busy || !clientId.trim()}
        aria-busy={busy === 'oauth-setup'}
      >
        {busy === 'oauth-setup' ? <Spinner /> : <ArrowRight size={17} />}
        {t('Save and continue')}
      </button>
      {onCancel && (
        <button type="button" className="text-button" disabled={!!busy} onClick={onCancel}>
          {t('Cancel')}
        </button>
      )}
    </form>
  );
}
