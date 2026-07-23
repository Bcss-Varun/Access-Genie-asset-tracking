import { AppShell } from '@/components/layout/AppShell';

/** Authenticated route group — everything here renders inside the app shell. */
export default function AppGroupLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
