import { Radio } from 'lucide-react';
import type { Settings, WatchProgress } from '../../../shared/types';
import { clock } from '../../lib/display';

export function WatchProgressBar({
  progress,
  connected,
  settings,
}: {
  progress: WatchProgress;
  connected: boolean;
  settings: Settings;
}) {
  return (
    <div className="watch-progress">
      <div className="progress-label">
        <span>
          <Radio size={14} /> {connected ? 'Watch progress' : 'Waiting for the player'}
        </span>
        <b>
          {progress.duration
            ? Math.min(100, Math.floor((progress.watched / progress.duration) * 100))
            : 0}
          %
        </b>
      </div>
      <div className="progress-track">
        <span
          style={{
            width: `${progress.duration ? Math.min(100, (progress.watched / progress.duration) * 100) : 0}%`,
          }}
        />
        <i style={{ left: `${settings.threshold}%` }} />
      </div>
      <div className="progress-caption">
        <span>
          {clock(progress.watched)} watched{' '}
          {progress.duration > 0 && `/ ${clock(progress.duration)}`}
        </span>
        <span>
          {settings.threshold}%{settings.promptAtEnd ? ' or near end' : ' to prompt'}
        </span>
      </div>
    </div>
  );
}
