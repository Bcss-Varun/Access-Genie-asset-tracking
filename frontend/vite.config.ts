import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  const apiTarget = env.VITE_API_PROXY ?? 'http://localhost:4000';
  const port = Number(env.VITE_PORT ?? 5173);
  const previewPort = Number(env.VITE_PREVIEW_PORT ?? 4173);

  /**
   * Proxy the API through the dev server so the browser sees a single origin.
   *
   * That is not just convenience: it makes the refresh cookie first-party,
   * removes the CORS preflight from every request, and matches how the app runs
   * behind a reverse proxy in production — so development exercises the same
   * arrangement production uses, rather than a laxer one.
   */
  const proxy = {
    '/api': { target: apiTarget, changeOrigin: true },
    '/health': { target: apiTarget, changeOrigin: true },
  };

  return {
    plugins: [react(), tailwindcss()],

    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },

    server: { port, proxy },

    // `vite preview` serves the real build, so it needs the same proxy: the
    // production bundle has to be exercisable against a live API.
    preview: { port: previewPort, proxy },

    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Keep the framework in its own chunk so an app change does not
          // invalidate the much larger, much less volatile vendor bundle.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            query: ['@tanstack/react-query', 'axios'],
          },
        },
      },
    },
  };
});
