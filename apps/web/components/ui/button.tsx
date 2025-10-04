'use client';

import * as React from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { twMerge } from 'tailwind-merge';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ComponentPropsWithoutRef<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

type ButtonElement = ElementRef<'button'>;

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-400 focus-visible:ring-brand-300 shadow-md shadow-brand-900/30',
  secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 focus-visible:ring-slate-500 shadow',
  outline:
    'border border-slate-700 text-slate-100 hover:bg-slate-900/60 focus-visible:ring-brand-400',
  ghost: 'text-slate-200 hover:bg-slate-900/70 focus-visible:ring-slate-600',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

const baseStyle =
  'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60 disabled:cursor-not-allowed';

export const Button = React.forwardRef<ButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={twMerge(baseStyle, variantStyles[variant], sizeStyles[size], className)}
        disabled={loading || props.disabled}
        {...props}
      >
        {loading && (
          <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = 'Button';
