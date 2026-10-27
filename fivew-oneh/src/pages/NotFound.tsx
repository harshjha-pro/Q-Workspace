import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../components/ui';

export default function NotFound({ what = 'page' }: { what?: string }) {
  return (
    <div>
      <PageHeader />
      <EmptyState icon={Compass} title={`We couldn't find that ${what}`} action={<Link to="/" className="font-medium text-forest-700 underline">Go to Home</Link>}>
        It may have been archived or the link may be incorrect. Try searching instead.
      </EmptyState>
    </div>
  );
}
