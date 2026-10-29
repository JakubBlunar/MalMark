import { Globe2, Trash2 } from 'lucide-react';
import type { SiteConfig } from '../../../shared/types';
import type { Act } from '../../types';

export function SavedSiteCard({ site, busy, act }: { site: SiteConfig; busy: string; act: Act }) {
  return (
    <section className="card custom-site">
      <div className="custom-site-heading">
        <Globe2 size={17} />
        <b>{new URL(site.origin).hostname}</b>
        <button
          className="icon-button danger-icon"
          disabled={!!busy}
          aria-label={`Remove website ${site.origin}`}
          onClick={() =>
            void act(
              site.id,
              { type: 'REMOVE_SITE_CONFIG', id: site.id },
              'Website setup removed. Reload its pages to stop existing scripts.',
            )
          }
        >
          <Trash2 size={15} />
        </button>
      </div>
      <details>
        <summary>Saved selectors</summary>
        <label>Anime title</label>
        <code>{site.titleSelector}</code>
        <label>Episode number</label>
        <code>{site.episodeSelector}</code>
      </details>
      <p className="helper">
        To replace these selectors, open an episode on this domain and run the picker again.
      </p>
    </section>
  );
}
