import { Check, Globe2, MousePointer2 } from 'lucide-react';
import type { Act } from '../../types';
import { setupWebsite } from '../../services/extension';

export function SiteSetupCard({
  url,
  tabId,
  busy,
  act,
}: {
  url?: string;
  tabId?: number;
  busy: string;
  act: Act;
}) {
  const usable = !!url && url.startsWith('https://') && tabId !== undefined;
  const domain = usable ? new URL(url).hostname : undefined;

  return (
    <section className="card site-setup-card">
      <div className="setup-illustration">
        <MousePointer2 size={24} />
        <div>
          <span className="fake-title">Anime title</span>
          <span className="fake-episode">Episode 8</span>
        </div>
        <Check size={17} />
      </div>
      <h2>Make any anime site feel supported.</h2>
      <p>
        Select two elements on a watch page. We’ll read them as episodes change, even when the URLs
        make no sense.
      </p>
      <ol className="setup-steps">
        <li>
          <span>1</span>
          <div>
            <b>Open an episode on your website</b>
            <p>Start setup from that tab’s Malmark popup.</p>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <b>Click the anime title, then the episode</b>
            <p>Choose the stable title in the description and the current episode label.</p>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <b>Review and save</b>
            <p>
              The selectors apply to this domain. MAL matches use the detected title, so changing
              episode URLs are fine.
            </p>
          </div>
        </li>
      </ol>
      {domain && (
        <div className="current-domain">
          <Globe2 size={14} />
          <span>{domain}</span>
        </div>
      )}
      <button
        className="button primary wide"
        disabled={!!busy || !usable}
        onClick={() =>
          void act(
            'setup',
            () => setupWebsite(url!, tabId!),
            'Website picker opened on the watch page.',
          )
        }
      >
        <MousePointer2 size={16} /> Choose elements on this page
      </button>
      <p className="helper">
        We’ll request access to this domain. Video players on another domain need their own optional
        permission.
      </p>
    </section>
  );
}
