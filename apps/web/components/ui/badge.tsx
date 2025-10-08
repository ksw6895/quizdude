import type { ReactNode } from 'react';
import clsx from 'clsx';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'muted';
  className?: string;
}

const variantStyles: Record<Required<BadgeProps>['variant'], string> = {
  default: 'border border-brand-200 bg-brand-50 text-brand-700',
  success: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border border-amber-200 bg-amber-50 text-amber-700',
  danger: 'border border-rose-200 bg-rose-50 text-rose-700',
  muted: 'border border-slate-200 bg-slate-100 text-slate-600',
};

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
        variantStyles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
