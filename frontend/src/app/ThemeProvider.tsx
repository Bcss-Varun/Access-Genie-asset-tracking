import { createContext, use, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { preferencesApi, usePreferences, usePreferenceMutation, type Theme } from '@/api/preferences';

/**
 * The theme, stored per user in MongoDB.
 *
 * It used to be a `localStorage` key, which made the preference a property of
 * the browser rather than of the person: set dark on the laptop, get light on
 * the phone, and lose it entirely when the browser clears its storage. It is
 * now part of the user's preferences document, so it follows them.
 *
 * **Light is the default.** The product's palette is designed light — dark is a
 * class-based override layered on top of it (see styles/index.css) — so light
 * is the theme every screen is actually composed against, and it is what an
 * account that has never chosen sees. `system` is still selectable and still
 * tracks the OS; it is simply no longer what you get by not choosing.
 *
 * Falling back to light rather than to the OS also removes the flash: the
 * preferences query needs a round trip, and before it lands the only honest
 * answer is the default. Guessing from the OS meant a light-by-default app
 * opened dark on a dark-mode laptop, then corrected itself a moment later.
 */

type Resolved = 'light' | 'dark';

interface ThemeContextValue {
  /** Resolved to something the UI can render — never `system`. */
  theme: Resolved;
  /** What the user actually chose, which may be `system`. */
  preference: Theme;
  toggleTheme: () => void;
  /** Alias — the ported prototype screens call it `toggle`. */
  toggle: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const osPrefersDark = (): boolean => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Signed out, this stays idle and the login screen renders light.
  const { data } = usePreferences();
  const preference: Theme = data?.theme ?? 'light';

  const save = usePreferenceMutation(preferencesApi.update);
  const setTheme = useCallback((next: Theme) => save.mutate([{ theme: next }]), [save]);

  const theme: Resolved = preference === 'system' ? (osPrefersDark() ? 'dark' : 'light') : preference;

  // The stylesheet keys dark mode off a `.dark` class on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Someone on `system` should follow the OS as it changes — at dusk, say —
  // without reloading. Only them: an explicit choice outranks the OS.
  useEffect(() => {
    if (preference !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', media.matches);
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);

  // Toggling from `system` commits to the opposite of what is on screen, which
  // is what the person pressing it means by it.
  const toggleTheme = useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [setTheme, theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, preference, toggleTheme, toggle: toggleTheme, setTheme }),
    [theme, preference, toggleTheme, setTheme],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
