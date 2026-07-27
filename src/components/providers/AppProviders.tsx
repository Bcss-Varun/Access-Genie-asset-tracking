'use client';

import { ThemeProvider } from './ThemeProvider';
import { SessionProvider } from './SessionProvider';
import { ScopeProvider } from './ScopeProvider';
import { CommandProvider } from './CommandProvider';
import { ToastProvider } from './ToastProvider';
import { MobileNavProvider } from './MobileNavProvider';
import { RegistryProvider } from './RegistryProvider';
import { ClassLibraryProvider } from './ClassLibraryProvider';
import { SavedViewsProvider } from './SavedViewsProvider';

/** Composes all client-side context providers. Mounted once in the root layout
 *  so both the auth pages and the app shell can read session/theme/toasts. */
export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider>
        <ScopeProvider>
          <ClassLibraryProvider>
            <RegistryProvider>
              <SavedViewsProvider>
                <CommandProvider>
                  <MobileNavProvider>
                    <ToastProvider>{children}</ToastProvider>
                  </MobileNavProvider>
                </CommandProvider>
              </SavedViewsProvider>
            </RegistryProvider>
          </ClassLibraryProvider>
        </ScopeProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
