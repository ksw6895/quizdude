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
    <header className="flex flex-col gap-6 rounded-xl border-2 border-sky-200 bg-white/90 px-6 py-5 shadow-card backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg border-2 border-brand-400 bg-brand-50 text-brand-600 shadow-sm">
            <span className="text-xl font-semibold">Q</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Quizdude
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Lecture Intelligence Control Center
            </h1>
          </div>
        </div>
        <div className="hidden gap-3 md:flex">
          <Link
            href="/dashboard"
            className="rounded-md border-2 border-brand-300 bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-400"
          >
            새 강의 업로드
          </Link>
          <Link
            href="/admin/jobs"
            className="rounded-md border-2 border-sky-200 px-4 py-2 text-sm font-semibold text-brand-600 transition hover:bg-brand-50"
          >
            잡 모니터링
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm text-slate-600">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'rounded-md border px-4 py-2 font-semibold transition',
                isActive
                  ? 'border-brand-400 bg-brand-50 text-brand-700 shadow-sm'
                  : 'border-transparent text-slate-600 hover:border-brand-200 hover:bg-sky-100 hover:text-brand-600',
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
