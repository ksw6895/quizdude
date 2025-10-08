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
        'w-full rounded-md border-2 border-sky-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200',
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = 'Textarea';
