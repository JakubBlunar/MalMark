import { useTranslation } from 'react-i18next';
import { version } from '../../../shared/releases';

export function AppFooter({ unread, onOpenNotes }: { unread: boolean; onOpenNotes: () => void }) {
  const { t } = useTranslation();
  return (
    <footer>
      <span>
        <span className="footer-dot" /> {t('Made for the next episode.')}
      </span>
      <button
        className={`footer-version ${unread ? 'has-update' : ''}`}
        aria-label={t(
          unread
            ? 'Version {{version}}, new changes available. What’s new'
            : 'Version {{version}}. What’s new',
          { version },
        )}
        onClick={onOpenNotes}
      >
        {unread && <span className="release-dot" aria-hidden="true" />}v{version}
        {unread && <span>{t('New')}</span>}
      </button>
    </footer>
  );
}
