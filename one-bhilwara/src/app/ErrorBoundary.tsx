import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';
import { Button, EmptyState } from '@/components/ui/primitives';

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('One Bhilwara error boundary', error, info.componentStack); }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    const chunk = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(this.state.error.message);
    return (
      <div className="p-4">
        <EmptyState icon={<TriangleAlert className="size-6" aria-hidden />} title={chunk ? 'This section needs a connection' : 'Something went wrong'}
          text={chunk ? 'This part of the app hasn’t been saved for offline use yet. Reconnect and try again.' : 'The error has been logged. You can try again or go back home.'}
          action={<div className="flex gap-2"><Button onClick={() => window.location.reload()}>Try again</Button><Link className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 font-semibold" to="/">Home</Link></div>} />
      </div>
    );
  }
}
