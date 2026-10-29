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
  return (
    <>
      <div className="page-title">
        <span className="eyebrow">YOUR WEBSITE. YOUR WAY.</span>
        <h1>Pick it. Track it.</h1>
        <p>Teach Malmark where to find the title and episode.</p>
      </div>
      <SiteSetupCard url={state.tabUrl} tabId={tabId} busy={busy} act={act} />
      <div className="list-heading">
        <h2>Your websites</h2>
        <span>{state.sites.length} CUSTOM</span>
      </div>
      <div className="card builtin-sites">
        <div>
          <span className="cr-mark">◔</span>
          <b>Crunchyroll</b>
          <small>BUILT IN · PRIMARY</small>
        </div>
      </div>
      {state.sites.map((site) => (
        <SavedSiteCard key={site.id} site={site} busy={busy} act={act} />
      ))}
      <div className="subtle-note">
        <ShieldCheck size={14} />
        <span>Only websites you choose get access.</span>
      </div>
    </>
  );
}
