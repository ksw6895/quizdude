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
    'border border-brand-600 bg-brand-600 text-white shadow-[0_14px_28px_-18px_rgba(37,99,235,0.65)] hover:bg-brand-500 focus-visible:ring-brand-200',
  secondary:
    'border border-brand-200 bg-white text-brand-600 hover:bg-brand-50 focus-visible:ring-brand-200',
  outline:
    'border-2 border-sky-200 bg-white text-slate-700 hover:bg-sky-50 focus-visible:ring-brand-200',
  ghost: 'text-slate-600 hover:bg-sky-100 focus-visible:ring-brand-200',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

const baseStyle =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60';

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
