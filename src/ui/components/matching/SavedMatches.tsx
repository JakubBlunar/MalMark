import { useTranslation } from 'react-i18next';
import { BookOpen, Link2, Trash2 } from 'lucide-react';
import type { Mapping } from '../../../shared/types';
import type { Act } from '../../types';

export function SavedMatches({
  mappings,
  busy,
  act,
}: {
  mappings: Mapping[];
  busy: string;
  act: Act;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="list-heading">
        <h2>{t('Saved matches')}</h2>
        <span>
          {mappings.length} {t('LOCAL')}
        </span>
      </div>
      {mappings.length ? (
        <div className="card saved-list">
          {mappings.map((mapping) => (
            <div className="saved-rule" key={mapping.id}>
              <div className="rule-icon">
                <Link2 size={17} />
              </div>
              <div>
                <b>{mapping.animeTitle}</b>
                <small title={mapping.prefix}>{mapping.prefix}</small>
                <span>
                  {t('Offset')} {mapping.episodeOffset > 0 ? '+' : ''}
                  {mapping.episodeOffset}
                  {mapping.season ? t(' · Season {{season}}', { season: mapping.season }) : ''}
                </span>
              </div>
              <button
                className="icon-button danger-icon"
                aria-label={t('Delete match for {{title}}', { title: mapping.animeTitle })}
                disabled={!!busy}
                onClick={() =>
                  void act(
                    mapping.id,
                    { type: 'REMOVE_MAPPING', id: mapping.id },
                    t('Saved match removed.'),
                  )
                }
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="dashed-empty">
          <BookOpen size={19} />
          <p>
            {t('Your saved matches will live here.')}
            <br />
            <span>{t('Stored on this browser, just for you.')}</span>
          </p>
        </div>
      )}
    </>
  );
}
