import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '../components/layout/app-shell';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Quizdude Dashboard',
  description: 'Upload lectures and generate structured summaries with quizzes.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={inter.variable}>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
