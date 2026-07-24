/**
 * The ported screens import `useTheme` from this path; the implementation
 * lives with the other app-level providers. Re-exported rather than duplicated
 * so there is exactly one theme state in the app.
 */
export { useTheme, ThemeProvider } from '@/app/ThemeProvider';
