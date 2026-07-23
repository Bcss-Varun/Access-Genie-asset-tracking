'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/primitives';

/** App-group error boundary. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // In production this would go to the error-tracking service.
    console.error(error);
  }, [error]);

  return (
    <div className="h-full flex items-center justify-center">
      <div className="glass-panel rounded-xl w-full max-w-lg">
        <ErrorState
          title="This page hit a snag"
          description="An unexpected error occurred while rendering. You can retry, or contact support with the trace id below."
          traceId={error.digest ?? 'demo-trace-0000'}
          onRetry={reset}
        />
      </div>
    </div>
  );
}
