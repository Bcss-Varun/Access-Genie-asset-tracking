import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { queryClient } from './app/queryClient';
import { router } from './app/router';
import { ThemeProvider } from './app/ThemeProvider';
import { AuthProvider } from './features/auth/AuthProvider';
import { ToastProvider } from './components/providers/ToastProvider';
import { ScopeProvider } from './components/providers/ScopeProvider';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    {/* QueryClientProvider wraps AuthProvider: the auth provider clears the
        query cache on sign-in and sign-out, so it needs the client above it. */}
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          {/* Toasts and the scope switcher are consumed by the ported screens. */}
          <ToastProvider>
            <ScopeProvider>
              <RouterProvider router={router} />
            </ScopeProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
