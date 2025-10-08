import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
    '../../packages/shared/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f9ff',
          100: '#e0edff',
          200: '#c8dbff',
          300: '#98c0ff',
          400: '#6ca3ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e3a8a',
          900: '#1e2a63',
        },
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626',
        slate: {
          950: '#0f172a',
        },
      },
      fontFamily: {
        display: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        body: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 24px 60px -30px rgba(37, 99, 235, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
