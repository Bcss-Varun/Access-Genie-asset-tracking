import type { ReactNode } from 'react';
import { ScopeProvider } from './ScopeProvider';
import { CommandProvider } from './CommandProvider';
import { MobileNavProvider } from './MobileNavProvider';
import { RegistryProvider } from './RegistryProvider';
import { SavedViewsProvider } from './SavedViewsProvider';

/**
 * The providers that need data.
 *
 * Mounted inside the dataset gate rather than at the root, because each of these
 * seeds itself from the loaded dataset — the class library from the asset
 * classes, the registry from the assets. Above the gate they would initialise
 * empty and stay that way.
 *
 * Theme, session and toasts are *not* here: the auth screens need them too, so
 * they live in main.tsx, above the router.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ScopeProvider>
        <RegistryProvider>
          <SavedViewsProvider>
            <CommandProvider>
              <MobileNavProvider>{children}</MobileNavProvider>
            </CommandProvider>
          </SavedViewsProvider>
        </RegistryProvider>
    </ScopeProvider>
  );
}
