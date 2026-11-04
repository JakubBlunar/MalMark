import { useTranslation } from 'react-i18next';
import { Globe2, Link2, ListVideo, ShieldCheck, TvMinimal, UserRound } from 'lucide-react';
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
  const { t } = useTranslation();
  return (
    <nav className="navigation" aria-label={t('Main navigation')}>
      <button className={view === 'watching' ? 'active' : ''} onClick={() => go('watching')}>
        <TvMinimal size={16} />
        <span>{t('Watching')}</span>
        {!!pendingCount && <i className="nav-count">{pendingCount}</i>}
      </button>
      <button className={view === 'matches' ? 'active' : ''} onClick={() => go('matches')}>
        <Link2 size={16} />
        <span>{t('Matches')}</span>
      </button>
      <button className={view === 'sites' ? 'active' : ''} onClick={() => go('sites')}>
        <Globe2 size={16} />
        <span>{t('Sites')}</span>
      </button>
      <button className={view === 'list' ? 'active' : ''} onClick={() => go('list')}>
        <ListVideo size={16} />
        <span>{t('My list')}</span>
      </button>
      {fullPage && (
        <button
          className={view === 'profile' ? 'active profile-nav' : 'profile-nav'}
          onClick={() => go('profile')}
        >
          <UserRound size={16} />
          <span>{t('Profile')}</span>
        </button>
      )}
      {fullPage && (
        <div className="sidebar-note">
          <ShieldCheck size={20} />
          <p>
            {t('Your list.')}
            <br />
            {t('Your call.')}
          </p>
          <small>
            {t('Confirm updates')}
            <br />
            {t('or enable automatic progress.')}
          </small>
        </div>
      )}
    </nav>
  );
}
