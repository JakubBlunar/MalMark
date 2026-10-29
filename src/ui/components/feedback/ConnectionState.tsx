import { CircleAlert, RefreshCw } from 'lucide-react';
import { Spinner } from '../shared/Spinner';

export function ConnectionError({
  error,
  busy,
  onRetry,
}: {
  error: string;
  busy: string;
  onRetry: () => Promise<void>;
}) {
  return (
    <section className="card empty-state" role="alert">
      <div className="empty-icon">
        <CircleAlert size={32} />
      </div>
      <h2>Malmark couldn’t start.</h2>
      <p>{error}</p>
      <p className="helper">
        Brave and Chrome: open the browser’s extensions page and click Reload on Malmark. For an
        older build, make sure Brave loads dist/chromium.
      </p>
      <button
        className="button primary wide"
        disabled={busy === 'retry'}
        onClick={() => void onRetry()}
      >
        {busy === 'retry' ? <Spinner /> : <RefreshCw size={16} />} Try again
      </button>
    </section>
  );
}

export function LoadingState() {
  return (
    <div className="loading">
      <Spinner />
      <span>Getting your watch session…</span>
    </div>
  );
}
