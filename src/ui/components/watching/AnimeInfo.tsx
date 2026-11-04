import { useTranslation } from 'react-i18next';
import type { WatchSession } from '../../../shared/types';
import { AnimeCover } from '../shared/AnimeCover';

export function AnimeInfo({ session: s }: { session: WatchSession }) {
  const { t } = useTranslation();
  const anime = s.anime;
  return (
    <div className="anime-info">
      <AnimeCover anime={anime} large />
      <div className="anime-copy">
        <div className="anime-meta">
          {anime?.media_type?.replaceAll('_', ' ').toUpperCase() || t('ANIME')}{' '}
          {anime?.start_season && (
            <>
              {' '}
              <span>·</span> {anime.start_season.year}
            </>
          )}
        </div>
        <h1>{anime?.alternative_titles?.en || anime?.title || s.detection.title}</h1>
        {anime?.alternative_titles?.en && <p className="original-title">{anime.title}</p>}
        <div className="episode-pill">
          {t('Episode')} {s.episode ?? '?'} <span>/ {anime?.num_episodes || '—'}</span>
        </div>
      </div>
    </div>
  );
}
