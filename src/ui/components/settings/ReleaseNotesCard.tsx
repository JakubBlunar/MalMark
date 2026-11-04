import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Sparkles } from 'lucide-react';
import { version } from '../../../shared/releases';
import { installedReleases } from '../../lib/release-history';

function ReleaseSections({ release }: { release: (typeof installedReleases)[number] }) {
  return (
    <div className="release-sections">
      {release.sections.map((section) => (
        <div key={section.title}>
          <h4>{section.title}</h4>
          <ul>
            {section.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function ReleaseNotesCard({
  unread,
  openRequest,
  onRead,
}: {
  unread: boolean;
  openRequest: number;
  onRead: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const section = useRef<HTMLElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!openRequest) return;
    setOpen(true);
    void onRead();
    const frame = requestAnimationFrame(() => {
      section.current?.scrollIntoView({ block: 'start' });
      button.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [openRequest, onRead]);
  const [latest, ...previous] = installedReleases;
  return (
    <section
      className="card settings-section release-notes"
      id="whats-new"
      aria-label="What’s new"
      ref={section}
    >
      <button
        className="release-toggle"
        aria-expanded={open}
        aria-controls="release-history"
        ref={button}
        onClick={() => {
          setOpen(!open);
          if (!open) void onRead();
        }}
      >
        <span className="setting-icon">
          <Sparkles size={18} />
        </span>
        <span className="release-label">
          <span className="release-heading">What’s new</span>
          <span>
            Version {version}
            {unread ? ' · New changes available' : ' · Release history'}
          </span>
        </span>
        <ChevronDown className={open ? 'expanded' : ''} size={18} />
      </button>
      {latest && (
        <div id="release-history" hidden={!open}>
          <div className="release-title">
            <span className="eyebrow accent">v{latest.version} · Current version</span>
            <h3>{latest.title}</h3>
          </div>
          <ReleaseSections release={latest} />
          {previous.length > 0 && <h3 className="previous-releases-title">Previous versions</h3>}
          {previous.map((release) => (
            <details className="previous-release" key={release.version}>
              <summary>
                <span>v{release.version}</span> {release.title}
              </summary>
              <ReleaseSections release={release} />
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
