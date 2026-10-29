import { ExternalLink, Plus, TvMinimal } from 'lucide-react';
import type { Navigate } from '../../types';

export function EmptyWatchingState({ go }: { go: Navigate }) {
  return (
    <section className="card empty-state">
      <div className="empty-icon">
        <TvMinimal size={32} />
      </div>
      <span className="eyebrow accent">NEXT UP: YOUR NEXT EPISODE</span>
      <h1>
        Something good
        <br />
        is waiting to play.
      </h1>
      <p>
        Open an episode on Crunchyroll, or add your own website in Sites. Your anime and watch
        progress will appear here.
      </p>
      <div className="site-links">
        <a href="https://www.crunchyroll.com/" target="_blank" rel="noreferrer">
          Crunchyroll <ExternalLink size={13} />
        </a>
        <button className="text-button" onClick={() => go('sites')}>
          Add a website <Plus size={13} />
        </button>
      </div>
      <div className="helper callout">
        Already watching? Reload the watch page after installing or reloading Malmark.
      </div>
    </section>
  );
}
