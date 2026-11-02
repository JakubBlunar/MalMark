import { useEffect, useId, useState } from 'react';
import { Check, Globe2, Trash2 } from 'lucide-react';
import type { SiteConfig } from '../../../shared/types';
import { selectorPreviewText, selectorSyntaxError } from '../../../shared/selector-validation';
import type { SiteSelectorPreview } from '../../../shared/selector-validation';
import type { Act } from '../../types';
import { request } from '../../services/extension';

export function SavedSiteCard({
  site,
  busy,
  act,
  tabId,
  tabUrl,
}: {
  site: SiteConfig;
  busy: string;
  act: Act;
  tabId?: number;
  tabUrl?: string;
}) {
  const fieldId = useId();
  const [titleSelector, setTitleSelector] = useState(site.titleSelector);
  const [episodeSelector, setEpisodeSelector] = useState(site.episodeSelector);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<SiteSelectorPreview>();
  const canTest = tabId !== undefined && !!tabUrl?.startsWith(site.origin + '/');
  useEffect(() => {
    if (!dirty) {
      setTitleSelector(site.titleSelector);
      setEpisodeSelector(site.episodeSelector);
    }
  }, [site.titleSelector, site.episodeSelector, dirty]);
  function valid() {
    const error =
      selectorSyntaxError(titleSelector, 'Anime title') ||
      selectorSyntaxError(episodeSelector, 'Episode');
    setError(error);
    return !error;
  }
  function reset() {
    setTitleSelector(site.titleSelector);
    setEpisodeSelector(site.episodeSelector);
    setDirty(false);
    setError('');
    setPreview(undefined);
  }
  return (
    <section className="card custom-site" aria-label={`Website ${new URL(site.origin).hostname}`}>
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
        <summary>Edit selectors</summary>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!valid()) return;
            void act(
              site.id,
              { type: 'UPDATE_SITE_CONFIG', id: site.id, titleSelector, episodeSelector },
              'Selectors saved. Open watch pages are being checked again.',
            ).then((ok) => {
              if (ok) {
                setDirty(false);
                setPreview(undefined);
              }
            });
          }}
        >
          <label htmlFor={`${fieldId}-title`}>Anime title selector</label>
          <textarea
            id={`${fieldId}-title`}
            rows={2}
            maxLength={2000}
            spellCheck={false}
            disabled={!!busy}
            value={titleSelector}
            onChange={(event) => {
              setTitleSelector(event.target.value);
              setDirty(true);
              setError('');
              setPreview(undefined);
            }}
          />
          <label htmlFor={`${fieldId}-episode`}>Episode selector</label>
          <textarea
            id={`${fieldId}-episode`}
            rows={2}
            maxLength={2000}
            spellCheck={false}
            disabled={!!busy}
            value={episodeSelector}
            onChange={(event) => {
              setEpisodeSelector(event.target.value);
              setDirty(true);
              setError('');
              setPreview(undefined);
            }}
          />
          <p className="helper">Use CSS selectors. The first matching element supplies its text.</p>
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          {preview && (
            <div className="selector-preview" role="status">
              <p className={preview.title.error ? 'warning-text' : ''}>
                Anime: {selectorPreviewText(preview.title)}
              </p>
              <p className={preview.episode.error ? 'warning-text' : ''}>
                Episode: {selectorPreviewText(preview.episode)}
              </p>
            </div>
          )}
          <div className="selector-actions">
            <button className="button primary" disabled={!!busy || !dirty} type="submit">
              <Check size={15} /> Save selectors
            </button>
            <button
              className="button secondary"
              disabled={!!busy || !dirty}
              type="button"
              onClick={reset}
            >
              Cancel
            </button>
            {canTest && (
              <button
                className="text-button"
                disabled={!!busy}
                type="button"
                onClick={() => {
                  if (!valid()) return;
                  void act(`test:${site.id}`, async () => {
                    const result = await request<SiteSelectorPreview>({
                      type: 'TEST_SITE_SELECTORS',
                      id: site.id,
                      tabId: tabId!,
                      titleSelector,
                      episodeSelector,
                    });
                    if (!result?.title || !result?.episode)
                      throw new Error('Reload the watch page, then test the selectors again.');
                    setPreview(result);
                  });
                }}
              >
                Test on this page
              </button>
            )}
          </div>
          {!canTest && (
            <p className="helper">
              Open an episode on this domain to test the selectors before saving.
            </p>
          )}
        </form>
      </details>
      <p className="helper">
        Edit the saved selectors here, or run the picker again on this website.
      </p>
    </section>
  );
}
