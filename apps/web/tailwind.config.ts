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
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
        success: '#16a34a',
        warning: '#f59e0b',
        danger: '#dc2626',
        slate: {
          950: '#0f172a',
        },
      },
      fontFamily: {
        display: ['"Pretendard Variable"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['"Pretendard Variable"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 12px 30px -12px rgba(15, 23, 42, 0.35)',
      },
    },
  },
  plugins: [],
};

export default config;
