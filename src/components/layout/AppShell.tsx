import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { CommandPalette } from './CommandPalette';
import { MobileDrawer } from './MobileDrawer';

/** The authenticated application shell. Providers live in the root layout so
 *  auth pages can also read session/theme; this only lays out the chrome. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[200] focus:top-2 focus:left-2 focus:bg-white focus:px-3 focus:py-2 focus:rounded-lg focus:shadow"
      >
        Skip to content
      </a>
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>
      <div className="flex flex-col flex-1 overflow-hidden">
        <TopBar />
        <main id="main" className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto h-full">{children}</div>
        </main>
      </div>
      <CommandPalette />
      <MobileDrawer />
    </div>
  );
}
