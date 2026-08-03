import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import { ThemeProvider } from './app/ThemeProvider';
import { AuthProvider } from './api/auth';
import { ToastProvider } from './components/providers/ToastProvider';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    {/* QueryClientProvider wraps AuthProvider: the auth provider clears the
        query cache on sign-in and sign-out, so it needs the client above it.

        ThemeProvider sits *inside* AuthProvider because the theme is now a
        per-user record in MongoDB rather than a localStorage key — it reads
        `/me/preferences`, so it needs to know whether anyone is signed in. It
        still wraps the router, so the auth screens are themed as before. */}
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          {/* Toasts are raised from the auth screens as well as the app, so they
              sit above the router. The data-dependent providers are mounted
              inside it — see components/providers/AppProviders.tsx. */}
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
