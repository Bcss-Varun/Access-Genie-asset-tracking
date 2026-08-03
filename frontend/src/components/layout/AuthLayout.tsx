import { Link } from 'react-router-dom';

/** Public, shell-less layout for the auth screens (login, MFA, recovery). */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left: brand / value panel (hidden on small screens) */}
      <div className="hidden lg:flex flex-col justify-between p-12 bg-slate-900 text-white relative overflow-hidden">
        <div className="relative z-10">
          <img src="/access-genie-logo.png" alt="Access Genie" className="w-52 h-auto rounded-md" />
        </div>
        <div className="relative z-10 max-w-md">
          <h2 className="text-3xl font-heading font-bold leading-tight">
            One asset graph. Record, location, condition, and prediction on every object.
          </h2>
          <p className="mt-4 text-slate-300 text-sm leading-relaxed">
            EAM + RTLS/IoT + a live digital twin + native, explainable AI — for millions of assets across every
            facility and industry.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {['RFID', 'BLE', 'UWB', 'GPS', 'LoRaWAN', 'AI', 'Digital Twin'].map((t) => (
              <span key={t} className="text-xs font-medium bg-white/10 border border-white/10 rounded-full px-3 py-1">
                {t}
              </span>
            ))}
          </div>
        </div>
        <div className="relative z-10 space-y-1">
          <p className="text-xs text-slate-400">
            Powered by <span className="font-semibold text-slate-300">Blue Cloud Softech Solutions Ltd.</span>
          </p>
          <p className="text-xs text-slate-500">© 2026 Access Genie AI · ISO 27001 · SOC 2 · DPDP Act 2023</p>
        </div>
        {/* subtle glow */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-primary-700/20 blur-3xl" />
      </div>

      {/* Right: the auth card */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="lg:hidden mb-8">
          <img src="/access-genie-logo.png" alt="Access Genie" className="w-48 h-auto rounded-md mx-auto" />
        </div>
        <div className="w-full max-w-sm">{children}</div>
        <p className="mt-8 text-xs text-slate-400 text-center">
          Need help? <Link to="/help" className="text-primary-600 hover:underline">Contact support</Link>
        </p>
        <div className="mt-6 flex flex-col items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-wider text-slate-300 font-semibold">Powered by</span>
          <img src="/bcss-logo.png" alt="Blue Cloud Softech Solutions Ltd." className="w-40 h-auto opacity-90" />
        </div>
      </div>
    </div>
  );
}
