import { Link } from 'react-router-dom';
import { AssetOpsArt } from './AssetOpsArt';

/**
 * Public, shell-less layout for the auth screens (login, MFA, recovery).
 *
 * Two panels: what the product is, and the one thing you came here to do. The
 * left is deliberately the taller-contrast surface so the form on the right is
 * the brightest thing on screen — on a sign-in page the input should win.
 *
 * The illustration sits bottom-left, behind the copy in stacking order but
 * masked so it fades out where the text sits. It is anchored rather than
 * centred because the eye enters top-left at the logo and leaves bottom-right
 * at the form; putting the drawing at the end of that diagonal fills the empty
 * corner instead of competing with the headline.
 */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-background">
      {/* ── Left: brand / value panel (hidden on small screens) ───────────── */}
      <div className="relative hidden overflow-hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col xl:p-14">
        {/* Ambient depth. Behind everything, including the art. */}
        <div className="pointer-events-none absolute -right-28 -top-28 h-96 w-96 rounded-full bg-primary-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 h-[28rem] w-[28rem] rounded-full bg-primary-700/25 blur-3xl" />
        {/* Faint grid — reads as engineering rather than marketing. */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative z-10">
          <img src="/access-genie-logo.png" alt="Access Genie" className="h-auto w-48 rounded-md" />
        </div>

        <div className="relative z-10 mt-14 max-w-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-300">
            Enterprise Asset Intelligence
          </p>
          <h2 className="mt-3 font-heading text-[2rem] font-bold leading-[1.15] xl:text-[2.35rem]">
            One asset graph.
            <span className="block text-primary-300">
              Record, location, condition and prediction on every object.
            </span>
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-300">
            EAM, RTLS and IoT tracking, a live digital twin, and native explainable AI — across every
            facility, for millions of assets.
          </p>

          <div className="mt-7 flex flex-wrap gap-2">
            {['RFID', 'BLE', 'UWB', 'GPS', 'LoRaWAN', 'AI', 'Digital Twin'].map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-medium text-slate-100"
              >
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* The illustration owns the bottom-left. `mt-auto` pushes it down so it
            sits on the footer rather than floating in the middle of the panel. */}
        <div className="relative z-10 mt-auto -mb-1 w-full max-w-[31rem] xl:max-w-[35rem]">
          <AssetOpsArt className="h-auto w-full" />
        </div>

        <div className="relative z-10 space-y-1 border-t border-white/10 pt-5">
          <p className="text-xs text-slate-400">
            Powered by <span className="font-semibold text-slate-300">Blue Cloud Softech Solutions Ltd.</span>
          </p>
          <p className="text-xs text-slate-500">
            © 2026 Access Genie AI · ISO 27001 · SOC 2 · DPDP Act 2023
          </p>
        </div>
      </div>

      {/* ── Right: the auth card ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center px-6 py-10 sm:px-10">
        <div className="mb-8 lg:hidden">
          <img src="/access-genie-logo.png" alt="Access Genie" className="mx-auto h-auto w-44 rounded-md" />
        </div>

        <div className="w-full max-w-sm">{children}</div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Need help?{' '}
          <Link to="/help" className="font-medium text-primary-600 hover:underline">
            Contact support
          </Link>
        </p>

        <div className="mt-6 flex flex-col items-center gap-1.5">
          <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-300">Powered by</span>
          <img src="/bcss-logo.png" alt="Blue Cloud Softech Solutions Ltd." className="h-auto w-36 opacity-90" />
        </div>
      </div>
    </div>
  );
}
