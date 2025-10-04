'use client';

import * as React from 'react';
import type { ComponentPropsWithoutRef } from 'react';
import clsx from 'clsx';

interface SwitchProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onChange'> {
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
}

export function Switch({ checked = false, onCheckedChange, className, ...props }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 items-center rounded-full border border-transparent transition',
        checked ? 'bg-brand-500 shadow-brand-500/50' : 'bg-slate-700',
        className,
      )}
      {...props}
    >
      <span
        className={clsx(
          'inline-block h-5 w-5 transform rounded-full bg-white transition',
          checked ? 'translate-x-5' : 'translate-x-1',
        )}
      />
    </button>
  );
}
