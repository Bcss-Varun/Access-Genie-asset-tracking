'use client';

import { ThemeProvider } from './ThemeProvider';
import { SessionProvider } from './SessionProvider';
import { ScopeProvider } from './ScopeProvider';
import { CommandProvider } from './CommandProvider';
import { ToastProvider } from './ToastProvider';
import { MobileNavProvider } from './MobileNavProvider';

/** Composes all client-side context providers. Mounted once in the root layout
 *  so both the auth pages and the app shell can read session/theme/toasts. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ScopeProvider>
          <CommandProvider>
            <MobileNavProvider>
              <ToastProvider>{children}</ToastProvider>
            </MobileNavProvider>
          </CommandProvider>
        </ScopeProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
