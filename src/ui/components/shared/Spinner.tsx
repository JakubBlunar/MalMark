import { useTranslation } from 'react-i18next';
import { LoaderCircle } from 'lucide-react';

export function Spinner() {
  const { t } = useTranslation();
  return <LoaderCircle size={16} className="spin" aria-label={t('Loading')} />;
}
