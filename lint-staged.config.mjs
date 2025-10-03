export default {
  "*.{ts,tsx,js,jsx}": ["pnpm exec eslint --no-warn-ignored --max-warnings=0"],
  "*.{ts,tsx,js,jsx,json,md}": ["pnpm exec prettier --check"]
};
