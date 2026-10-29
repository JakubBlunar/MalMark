import { version } from '../../../../package.json';

export function AppFooter() {
  return (
    <footer>
      <span>
        <span className="footer-dot" /> Made for the next episode.
      </span>
      <span>v{version}</span>
    </footer>
  );
}
