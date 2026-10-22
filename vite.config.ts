import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

function commit(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  // Relative asset paths, so the build works from a GitHub Pages project URL (/<repo>/).
  base: './',
  // Stamp each build so the menu can show which version is loaded.
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(commit()),
    __BUILD_DEPLOYED__: JSON.stringify(process.env.GITHUB_ACTIONS === 'true'),
  },
});
