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
        'relative inline-flex h-6 w-11 items-center rounded-full border transition',
        checked
          ? 'border-brand-500 bg-brand-500 shadow-[0_8px_16px_-10px_rgba(37,99,235,0.65)]'
          : 'border-sky-200 bg-sky-100',
        className,
      )}
      {...props}
    >
      <span
        className={clsx(
          'inline-block h-5 w-5 transform rounded-full bg-white shadow transition',
          checked ? 'translate-x-5' : 'translate-x-1',
        )}
      />
    </button>
  );
}
