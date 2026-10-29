import logo from '../../../assets/logo.svg';
import { ExternalLink, PanelRightOpen, UserRound } from 'lucide-react';
import type { Profile } from '../../../shared/types';
import type { View, Act, Navigate } from '../../types';
import { inExtension, openSettings } from '../../services/extension';
import { sidebar } from '../../lib/surface';

export function AppHeader({
  connected,
  profile,
  view,
  go,
  busy,
  tabId,
  showSidebar,
  act,
  url,
}: {
  connected: boolean;
  profile?: Profile;
  view: View;
  go: Navigate;
  busy: string;
  tabId?: number;
  showSidebar: () => Promise<void>;
  act: Act;
  url?: string;
}) {
  return (
    <>
      <header className="header">
        <button className="brand" onClick={() => go('watching')} aria-label="Malmark home">
          <span className="brand-icon">
            <img src={logo} alt="" />
          </span>
          <span>
            Mal<span className="brand-light">mark</span>
            <small>WATCH. ENJOY. REMEMBER.</small>
          </span>
        </button>
        <div className="header-actions">
          {!sidebar && (
            <button
              className="icon-button"
              title="Open sidebar"
              aria-label="Open sidebar"
              disabled={!!busy || (inExtension && tabId === undefined)}
              onClick={() => void showSidebar()}
            >
              <PanelRightOpen size={18} />
            </button>
          )}
          {sidebar && connected && (
            <button
              className="icon-button expand"
              title="Open full settings"
              aria-label="Open full settings"
              onClick={() => void act('open', openSettings)}
            >
              <ExternalLink size={16} />
            </button>
          )}
          {connected && (
            <button
              className={`avatar ${view === 'profile' ? 'selected' : ''}`}
              onClick={() => go('profile')}
              aria-label="Open profile"
            >
              {profile?.picture ? <img src={profile.picture} alt="" /> : <UserRound size={18} />}
              <i className={connected ? 'online' : ''} />
            </button>
          )}
        </div>
      </header>
      {sidebar && (
        <div className="sidebar-context" aria-live="polite">
          <span className="status-dot online" />
          <span>Following active tab</span>
          {url && <b>{new URL(url).hostname}</b>}
        </div>
      )}
    </>
  );
}
