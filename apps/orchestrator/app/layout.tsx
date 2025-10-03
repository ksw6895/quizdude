import type { ReactNode } from 'react';

export const metadata = {
  title: 'Quizdude Orchestrator',
  description: 'Internal orchestration APIs for Quizdude lecture workflows.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
