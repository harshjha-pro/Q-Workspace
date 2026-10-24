import { Compass } from 'lucide-react';
import { EmptyState, LinkButton } from '@/components/ui/primitives';
import { useDocumentTitle, useT } from '@/hooks/useStore';

export default function NotFound() {
  const t = useT();
  useDocumentTitle(t('pageNotFound'));
  return (
    <EmptyState icon={<Compass className="size-6" aria-hidden />} title={t('pageNotFound')} text="The page may have moved, or the link is incorrect."
      action={<div className="flex flex-wrap justify-center gap-2"><LinkButton to="/">{t('goHome')}</LinkButton><LinkButton variant="secondary" to="/discover">Browse categories</LinkButton><LinkButton variant="secondary" to="/search">Search</LinkButton></div>} />
  );
}
