import { Globe2, Link2, Settings2, ShieldCheck, TvMinimal, UserRound } from 'lucide-react';
import type { View, Navigate } from '../../types';
import { fullPage } from '../../lib/surface';

export function AppNavigation({
  view,
  go,
  pendingCount,
}: {
  view: View;
  go: Navigate;
  pendingCount: number;
}) {
  return (
    <nav className="navigation" aria-label="Main navigation">
      <button className={view === 'watching' ? 'active' : ''} onClick={() => go('watching')}>
        <TvMinimal size={16} />
        <span>Watching</span>
        {!!pendingCount && <i className="nav-count">{pendingCount}</i>}
      </button>
      <button className={view === 'matches' ? 'active' : ''} onClick={() => go('matches')}>
        <Link2 size={16} />
        <span>Matches</span>
      </button>
      <button className={view === 'sites' ? 'active' : ''} onClick={() => go('sites')}>
        <Globe2 size={16} />
        <span>Sites</span>
      </button>
      <button className={view === 'settings' ? 'active' : ''} onClick={() => go('settings')}>
        <Settings2 size={16} />
        <span>Settings</span>
      </button>
      {fullPage && (
        <button
          className={view === 'profile' ? 'active profile-nav' : 'profile-nav'}
          onClick={() => go('profile')}
        >
          <UserRound size={16} />
          <span>Profile</span>
        </button>
      )}
      {fullPage && (
        <div className="sidebar-note">
          <ShieldCheck size={20} />
          <p>
            Your list.
            <br />
            Your call.
          </p>
          <small>
            Confirm updates
            <br />
            or enable automatic progress.
          </small>
        </div>
      )}
    </nav>
  );
}
