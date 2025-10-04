'use client';

import * as React from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';
import { twMerge } from 'tailwind-merge';

export type TextareaProps = ComponentPropsWithoutRef<'textarea'>;

type TextareaElement = ElementRef<'textarea'>;

export const Textarea = React.forwardRef<TextareaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={twMerge(
        'w-full rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 shadow-inner focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40',
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = 'Textarea';
