/** ISO timestamp of the build, injected by vite.config.ts. */
declare const __BUILD_TIME__: string;
/** Short git commit hash of the build, or '' if unknown. */
declare const __BUILD_COMMIT__: string;
/** True when the build ran in GitHub Actions (that is, a Pages deployment). */
declare const __BUILD_DEPLOYED__: boolean;
