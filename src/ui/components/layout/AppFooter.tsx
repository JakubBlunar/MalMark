import { version } from '../../../shared/releases';

export function AppFooter({ unread, onOpenNotes }: { unread: boolean; onOpenNotes: () => void }) {
  return (
    <footer>
      <span>
        <span className="footer-dot" /> Made for the next episode.
      </span>
      <button
        className={`footer-version ${unread ? 'has-update' : ''}`}
        aria-label={`Version ${version}${unread ? ', new changes available' : ''}. What’s new`}
        onClick={onOpenNotes}
      >
        {unread && <span className="release-dot" aria-hidden="true" />}v{version}
        {unread && <span>New</span>}
      </button>
    </footer>
  );
}
