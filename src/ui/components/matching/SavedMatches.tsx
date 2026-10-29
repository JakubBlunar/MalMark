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
  return (
    <>
      <div className="list-heading">
        <h2>Saved matches</h2>
        <span>{mappings.length} LOCAL</span>
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
                  Offset {mapping.episodeOffset > 0 ? '+' : ''}
                  {mapping.episodeOffset}
                  {mapping.season ? ` · Season ${mapping.season}` : ''}
                </span>
              </div>
              <button
                className="icon-button danger-icon"
                aria-label={`Delete match for ${mapping.animeTitle}`}
                disabled={!!busy}
                onClick={() =>
                  void act(
                    mapping.id,
                    { type: 'REMOVE_MAPPING', id: mapping.id },
                    'Saved match removed.',
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
            Your saved matches will live here.
            <br />
            <span>Stored on this browser, just for you.</span>
          </p>
        </div>
      )}
    </>
  );
}
