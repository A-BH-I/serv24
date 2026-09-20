import { ReactNode } from 'react';
import { Loader2, RefreshCcw, WifiOff } from 'lucide-react';

interface ApiStateProps {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  children: ReactNode;
  skeleton?: ReactNode;
}

export function ApiState({ loading, error, onRetry, children, skeleton }: ApiStateProps) {
  if (loading) {
    return skeleton || (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 text-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 px-4">
        <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-3">
          <WifiOff className="h-5 w-5 text-destructive" />
        </div>
        <p className="text-sm font-medium text-foreground mb-1">Something went wrong</p>
        <p className="text-xs text-muted-foreground mb-4 max-w-xs mx-auto">{error}</p>
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium btn-press hover:opacity-90 transition-opacity"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          Try Again
        </button>
      </div>
    );
  }

  return <>{children}</>;
}

export function CardSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 bg-muted rounded w-2/3" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
            <div className="h-4 bg-muted rounded w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-card rounded-xl border border-border p-5 animate-pulse">
          <div className="h-5 w-5 bg-muted rounded mb-3" />
          <div className="h-6 bg-muted rounded w-1/2 mb-2" />
          <div className="h-3 bg-muted rounded w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border">
        <div className="h-4 bg-muted rounded w-1/4 animate-pulse" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 animate-pulse">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="h-3.5 bg-muted rounded flex-1" style={{ maxWidth: j === 0 ? '120px' : '80px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}
