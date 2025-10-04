import { twMerge } from 'tailwind-merge';
import type { PropsWithChildren } from 'react';

interface CardProps extends PropsWithChildren {
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddingMap = {
  none: 'p-0',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

export function Card({ children, className, padding = 'md' }: CardProps) {
  return (
    <div
      className={twMerge(
        'rounded-2xl border border-slate-800 bg-slate-900/70 backdrop-blur shadow-card',
        paddingMap[padding],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      {description ? <p className="text-sm text-slate-300">{description}</p> : null}
    </div>
  );
}

export function CardFooter({ children }: PropsWithChildren) {
  return <div className="mt-6 flex flex-wrap gap-3">{children}</div>;
}
