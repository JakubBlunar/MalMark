import { useTranslation } from 'react-i18next';
import { CircleAlert, CircleCheck, X } from 'lucide-react';

export function Notice({
  message,
  variant,
  onDismiss,
}: {
  message: string;
  variant: 'error' | 'success';
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`notice ${variant}`}>
      {variant === 'error' ? <CircleAlert size={17} /> : <CircleCheck size={17} />}
      <span>{message}</span>
      <button
        aria-label={variant === 'error' ? t('Dismiss error') : t('Dismiss message')}
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}
