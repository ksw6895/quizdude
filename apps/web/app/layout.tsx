import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quizdude Dashboard',
  description: 'Upload lectures and generate structured summaries with quizzes.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
