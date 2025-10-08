import clsx from 'clsx';

const STATUS_COLORS: Record<string, string> = {
  SUCCEEDED: 'bg-success/80',
  READY: 'bg-success/80',
  PROCESSING: 'bg-brand-400/80',
  PENDING: 'bg-brand-400/80',
  UPLOADING: 'bg-brand-400/80',
  FAILED: 'bg-danger/80',
  NEEDS_ATTENTION: 'bg-danger/80',
};

interface StatusIndicatorProps {
  status?: string | null;
  label?: string;
  className?: string;
}

export function StatusIndicator({ status, label, className }: StatusIndicatorProps) {
  const tone = status ? (STATUS_COLORS[status] ?? 'bg-slate-400') : 'bg-slate-400';
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-2 text-sm font-medium text-slate-600',
        className,
      )}
    >
      <span className={clsx('h-2.5 w-2.5 rounded-full', tone)} />
      {label ?? status ?? '—'}
    </span>
  );
}
