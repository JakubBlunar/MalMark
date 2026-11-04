import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import type { PublicState } from '../../shared/types';
import type { Act } from '../types';
import { SiteSetupCard } from '../components/sites/SiteSetupCard';
import { SavedSiteCard } from '../components/sites/SavedSiteCard';

export function SitesView({
  state,
  tabId,
  busy,
  act,
}: {
  state: PublicState;
  tabId?: number;
  busy: string;
  act: Act;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">{t('YOUR WEBSITE. YOUR WAY.')}</span>
        <h1>{t('Pick it. Track it.')}</h1>
        <p>{t('Teach Malmark where to find the title and episode.')}</p>
      </div>
      <SiteSetupCard url={state.tabUrl} tabId={tabId} busy={busy} act={act} />
      <div className="list-heading">
        <h2>{t('Your websites')}</h2>
        <span>
          {state.sites.length} {t('CUSTOM')}
        </span>
      </div>
      <div className="card builtin-sites">
        <div>
          <span className="cr-mark">◔</span>
          <b>{'Crunchyroll'}</b>
          <small>{t('BUILT IN · PRIMARY')}</small>
        </div>
      </div>
      {state.sites.map((site) => (
        <SavedSiteCard
          key={site.id}
          site={site}
          busy={busy}
          act={act}
          tabId={tabId}
          tabUrl={state.tabUrl}
        />
      ))}
      <div className="subtle-note">
        <ShieldCheck size={14} />
        <span>{t('Only websites you choose get access.')}</span>
      </div>
    </>
  );
}
