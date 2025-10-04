import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { AppShell } from '../components/layout/app-shell';

export const metadata: Metadata = {
  title: 'Quizdude Dashboard',
  description: 'Upload lectures and generate structured summaries with quizzes.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
