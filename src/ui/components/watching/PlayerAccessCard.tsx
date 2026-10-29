import { Eye, Plus } from 'lucide-react';
import type { WatchSession } from '../../../shared/types';
import type { Act } from '../../types';
import { grantPlayer } from '../../services/extension';

export function PlayerAccessCard({
  session: s,
  permissions,
  tabId,
  busy,
  act,
}: {
  session: WatchSession;
  permissions: string[];
  tabId?: number;
  busy: string;
  act: Act;
}) {
  return (
    <section className="card player-access">
      <div className="row-icon">
        <Eye size={18} />
        <div>
          <h3>Connect the embedded player</h3>
          <p>Allow its domain to read playback time. Choose the host used by the video.</p>
        </div>
      </div>
      {s.frameOrigins
        .filter((origin) => !permissions.includes(origin + '/*'))
        .map((origin) => (
          <div className="permission-row" key={origin}>
            <span>{new URL(origin).hostname}</span>
            <button
              className="text-button"
              disabled={!!busy}
              onClick={() =>
                void act(
                  origin,
                  () => grantPlayer(origin, tabId!),
                  'Player access granted. Start or resume the video.',
                )
              }
            >
              Allow <Plus size={13} />
            </button>
          </div>
        ))}
    </section>
  );
}
