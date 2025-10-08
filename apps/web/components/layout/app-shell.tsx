import type { ReactNode } from 'react';

import { PrimaryNav } from './primary-nav';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-sky-50 text-slate-900">
      <div className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,_rgba(148,197,255,0.35),_transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(59,130,246,0.12)_1px,transparent_1px),linear-gradient(180deg,rgba(59,130,246,0.12)_1px,transparent_1px)] bg-[size:120px_120px]" />
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 pb-16 pt-10 lg:px-10">
        <PrimaryNav />
        <main className="mt-10 flex-1">{children}</main>
      </div>
    </div>
  );
}
