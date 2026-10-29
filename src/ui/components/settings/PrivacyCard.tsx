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
  return (
    <section className="card settings-section">
      <div className="settings-heading">
        <span className="setting-icon">
          <ShieldCheck size={18} />
        </span>
        <div>
          <h2>Local by default.</h2>
          <p>Your watching stays yours.</p>
        </div>
      </div>
      <p className="privacy-copy">
        Tokens, settings, and saved matches stay in this browser. Detected anime titles are sent to
        MyAnimeList to find a match. No analytics or third-party tracking services.
      </p>
      <p className="privacy-copy">
        List changes always need your approval. Disconnecting removes your tokens and queued
        updates; saved matches stay on this device.
      </p>
      <a className="text-button" href="./THIRD_PARTY_NOTICES.md" target="_blank" rel="noreferrer">
        Licenses and third-party credits <ExternalLink size={12} />
      </a>
      {permissions.length > 0 && (
        <>
          <h3 className="permission-title">Allowed player domains</h3>
          {permissions.map((origin) => (
            <div className="permission-row" key={origin}>
              <span>{origin.replace('https://', '').replace('/*', '')}</span>
              <button
                className="icon-button danger-icon"
                disabled={!!busy}
                aria-label={`Revoke ${origin}`}
                onClick={() =>
                  void act(
                    origin,
                    () => revokePlayer(origin),
                    'Permission removed. Reload the watch page to stop an already injected player script.',
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
