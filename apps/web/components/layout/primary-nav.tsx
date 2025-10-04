'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const navItems = [
  { href: '/', label: '홈' },
  { href: '/dashboard', label: '업로드 대시보드' },
  { href: '/admin/jobs', label: '관리자 진단' },
];

export function PrimaryNav() {
  const pathname = usePathname();

  return (
    <header className="flex flex-col gap-6 rounded-3xl border border-slate-800/80 bg-slate-900/60 px-6 py-5 shadow-card backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-500/20 text-brand-200 shadow-inner shadow-brand-900/40">
            <span className="text-lg font-bold">Q</span>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">Quizdude</p>
            <h1 className="text-xl font-semibold text-white">
              Lecture Intelligence Control Center
            </h1>
          </div>
        </div>
        <div className="hidden gap-3 md:flex">
          <Link
            href="/dashboard"
            className="rounded-xl border border-brand-400/30 bg-brand-500/20 px-4 py-2 text-sm font-medium text-brand-100 transition hover:bg-brand-500/30"
          >
            새 강의 업로드
          </Link>
          <Link
            href="/admin/jobs"
            className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            잡 모니터링
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm text-slate-300">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'rounded-2xl px-4 py-2 font-medium transition',
                isActive
                  ? 'bg-brand-500/30 text-brand-100 shadow-inner shadow-brand-900/30'
                  : 'hover:bg-slate-800 text-slate-300',
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
