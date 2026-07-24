import { createContext, useContext, useState, useCallback } from 'react';

type ToastTone = 'default' | 'success' | 'error' | 'info';
interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (t: { title: string; description?: string; tone?: ToastTone }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
let nextId = 1;

const toneStyles: Record<ToastTone, string> = {
  default: 'border-slate-200 bg-white text-slate-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-primary-200 bg-primary-50 text-primary-900',
};
const toneIcon: Record<ToastTone, string> = { default: '💬', success: '✅', error: '⚠️', info: 'ℹ️' };

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: { title: string; description?: string; tone?: ToastTone }) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, title: t.title, description: t.description, tone: t.tone ?? 'default' }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg animate-[fadeIn_0.15s_ease-out] ${toneStyles[t.tone]}`}
          >
            <span className="text-base leading-none mt-0.5">{toneIcon[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">{t.title}</div>
              {t.description && <div className="text-xs opacity-80 mt-0.5">{t.description}</div>}
            </div>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="text-slate-400 hover:text-slate-700 text-sm leading-none"
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
