import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'ag.theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  /** Alias — the ported prototype screens call it `toggle`. */
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/** Read the stored preference, falling back to the OS setting. */
function initialTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Private-mode browsers throw on localStorage access; the OS default is
    // a perfectly good answer.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  // The stylesheet keys dark mode off a `.dark` class on <html>.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* preference simply does not persist */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), []);
  const value = useMemo(() => ({ theme, toggleTheme, toggle: toggleTheme }), [theme, toggleTheme]);

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}
