import { useTranslation } from 'react-i18next';
import { ExternalLink, ShieldCheck, Trash2 } from 'lucide-react';
import type { Act } from '../../types';
import { revokePlayer } from '../../services/extension';

export function PrivacyCard({
  permissions,
  busy,
  act,
}: {
  permissions: string[];
  busy: string;
  act: Act;
}) {
  const { t } = useTranslation();
  return (
    <section className="card settings-section">
      <div className="settings-heading">
        <span className="setting-icon">
          <ShieldCheck size={18} />
        </span>
        <div>
          <h2>{t('Local by default.')}</h2>
          <p>{t('Your watching stays yours.')}</p>
        </div>
      </div>
      <p className="privacy-copy">
        {t(
          'Tokens, settings, and saved matches stay in this browser. Detected anime titles are sent to MyAnimeList to find a match. No analytics or third-party tracking services.',
        )}
      </p>
      <p className="privacy-copy">
        {t(
          'Updates ask for confirmation by default. You can enable automatic progress for the next episode of anime in Currently Watching. Partial episode progress stays for up to 30 days, with at most 100 episodes saved. Disconnecting removes tokens, playback progress and queued updates; saved matches stay on this device.',
        )}
      </p>
      <a className="text-button" href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">
        {t('Licenses and third-party credits')} <ExternalLink size={12} />
      </a>
      {permissions.length > 0 && (
        <>
          <h3 className="permission-title">{t('Allowed player domains')}</h3>
          {permissions.map((origin) => (
            <div className="permission-row" key={origin}>
              <span>{origin.replace('https://', '').replace('/*', '')}</span>
              <button
                className="icon-button danger-icon"
                disabled={!!busy}
                aria-label={t('Revoke {{origin}}', { origin })}
                onClick={() =>
                  void act(
                    origin,
                    () => revokePlayer(origin),
                    t(
                      'Permission removed. Reload the watch page to stop an already injected player script.',
                    ),
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
