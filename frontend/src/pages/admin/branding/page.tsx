import { useState } from 'react';
import { PageHeader } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { useMutate } from '@/api/mutate';
import { orgSettingsApi } from '@/api/configuration';
import { orgSettings } from '@/lib/dataset';
import { cn } from '@/lib/utils';

/**
 * The tenant's own identity.
 *
 * Everything on this page used to be local state with a save button that raised
 * a toast — the organisation name in the header never changed, and reloading
 * put the defaults back.
 *
 * Two fields are gone rather than kept as decoration. A logo upload needs
 * somewhere to put the file, and a vanity subdomain needs DNS and a certificate;
 * neither exists in this deployment, and a control that cannot do its job is
 * worse than its absence. An emoji mark covers what the logo was for — it shows
 * up in the header, the tab and the login screen — and it works.
 */

const SWATCHES = [
  { name: 'Genie Blue', value: '#2563eb' },
  { name: 'Indigo', value: '#4f46e5' },
  { name: 'Emerald', value: '#059669' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Rose', value: '#e11d48' },
  { name: 'Amber', value: '#d97706' },
  { name: 'Slate', value: '#334155' },
];

const MARKS = ['🧞', '🏢', '⚙️', '📦', '🛰️', '🔧', '🛡️', '⚡', '🏭', '🚚'];

const TIMEZONES = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];
const DATE_FORMATS = ['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD'];

const input =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500';
const label = 'mb-1.5 block text-sm font-medium text-slate-700';

export default function BrandingPage() {
  const { run, isPending } = useMutate();
  const saved = orgSettings;

  const [name, setName] = useState(saved.name);
  const [legalName, setLegalName] = useState(saved.legalName);
  const [logoEmoji, setLogoEmoji] = useState(saved.logoEmoji);
  const [primaryColor, setPrimaryColor] = useState(saved.primaryColor);
  const [loginMessage, setLoginMessage] = useState(saved.loginMessage);
  const [supportEmail, setSupportEmail] = useState(saved.supportEmail);
  const [timezone, setTimezone] = useState(saved.timezone);
  const [dateFormat, setDateFormat] = useState(saved.dateFormat);
  const [currency, setCurrency] = useState(saved.currency);

  const dirty =
    name !== saved.name ||
    legalName !== saved.legalName ||
    logoEmoji !== saved.logoEmoji ||
    primaryColor !== saved.primaryColor ||
    loginMessage !== saved.loginMessage ||
    supportEmail !== saved.supportEmail ||
    timezone !== saved.timezone ||
    dateFormat !== saved.dateFormat ||
    currency !== saved.currency;

  const save = () =>
    void run(
      orgSettingsApi.update({
        name: name.trim(),
        legalName: legalName.trim(),
        logoEmoji,
        primaryColor,
        loginMessage: loginMessage.trim(),
        supportEmail: supportEmail.trim(),
        timezone,
        dateFormat,
        currency,
      }),
      {
        success: 'Branding saved',
        successDetail: `${name.trim()} — applied across the tenant.`,
        describe: 'save those settings',
      },
    );

  return (
    <div className="h-full flex flex-col space-y-6">
      <PageHeader
        title="Branding & Organisation"
        subtitle="The tenant's identity and the formats every screen renders dates and money in."
        breadcrumb={[{ label: 'Administration' }, { label: 'Branding' }]}
        actions={
          <Button disabled={isPending || !dirty || name.trim().length < 1} onClick={save}>
            {isPending ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="glass-panel space-y-5 rounded-xl p-6">
            <h2 className="font-heading font-semibold text-slate-900">Identity</h2>

            <div>
              <label htmlFor="orgName" className={label}>Organisation name</label>
              <input id="orgName" value={name} onChange={(e) => setName(e.target.value)} className={input} />
              <p className="mt-1 text-xs text-slate-400">Shown in the header, the browser tab and the sign-in screen.</p>
            </div>

            <div>
              <label htmlFor="legalName" className={label}>Legal entity name</label>
              <input
                id="legalName"
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="Bharat Infra Assets Pvt Ltd"
                className={input}
              />
              <p className="mt-1 text-xs text-slate-400">Used on exported compliance documents.</p>
            </div>

            <div>
              <span className={label}>Mark</span>
              <div className="flex flex-wrap gap-1.5">
                {MARKS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-label={`Use ${m}`}
                    aria-pressed={logoEmoji === m}
                    onClick={() => setLogoEmoji(m)}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xl transition-colors',
                      logoEmoji === m ? 'border-primary-300 bg-primary-50' : 'border-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className={label}>Primary colour</span>
              <div className="flex flex-wrap items-center gap-2.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-label={s.name}
                    aria-pressed={primaryColor === s.value}
                    onClick={() => setPrimaryColor(s.value)}
                    className={cn(
                      'h-9 w-9 rounded-full ring-2 ring-offset-2 transition-transform hover:scale-105',
                      primaryColor === s.value ? 'ring-slate-800' : 'ring-transparent',
                    )}
                    style={{ backgroundColor: s.value }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Custom colour"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="h-9 w-9 cursor-pointer rounded-full border border-slate-200 bg-transparent p-0.5"
                />
                <code className="font-mono text-xs text-slate-500">{primaryColor}</code>
              </div>
            </div>

            <div>
              <label htmlFor="loginMessage" className={label}>Sign-in message</label>
              <input
                id="loginMessage"
                value={loginMessage}
                onChange={(e) => setLoginMessage(e.target.value)}
                placeholder="Authorised users only. Contact IT for access."
                className={input}
              />
            </div>

            <div>
              <label htmlFor="supportEmail" className={label}>Support email</label>
              <input
                id="supportEmail"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="itsupport@company.com"
                className={input}
              />
            </div>
          </div>

          <div className="glass-panel space-y-5 rounded-xl p-6">
            <h2 className="font-heading font-semibold text-slate-900">Formats</h2>
            <p className="-mt-3 text-xs text-slate-500">
              How every screen renders a date and an amount. Set once here rather than guessed per screen.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="tz" className={label}>Timezone</label>
                <select id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} className={input}>
                  {TIMEZONES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="df" className={label}>Date format</label>
                <select id="df" value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className={input}>
                  {DATE_FORMATS.map((d) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cur" className={label}>Currency</label>
                <select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)} className={input}>
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div className="glass-panel h-fit rounded-xl p-6">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Live preview</div>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 px-5 py-4 text-white" style={{ backgroundColor: primaryColor }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 text-xl">{logoEmoji}</div>
              <div className="min-w-0">
                <div className="truncate font-heading text-lg font-bold">{name || 'Your organisation'}</div>
                <div className="truncate text-xs text-white/80">{legalName || 'Legal entity name'}</div>
              </div>
            </div>
            <div className="space-y-4 bg-white p-5">
              {loginMessage && <p className="text-xs text-slate-500 italic">“{loginMessage}”</p>}
              <div className="h-2 w-2/3 rounded-full bg-slate-200" />
              <div className="h-2 w-1/2 rounded-full bg-slate-100" />
              <div className="flex gap-2 pt-1">
                <span className="rounded-lg px-3 py-1.5 text-sm font-medium text-white" style={{ backgroundColor: primaryColor }}>
                  Primary Action
                </span>
                <span className="rounded-lg border px-3 py-1.5 text-sm font-medium" style={{ borderColor: primaryColor, color: primaryColor }}>
                  Secondary
                </span>
              </div>
              <div className="border-t border-slate-100 pt-3 text-xs text-slate-500">
                Dates as <span className="font-medium text-slate-700">{dateFormat}</span> · amounts in{' '}
                <span className="font-medium text-slate-700">{currency}</span> · times in{' '}
                <span className="font-medium text-slate-700">{timezone}</span>
              </div>
            </div>
          </div>

          <p className="mt-4 text-xs text-slate-400">
            Logo upload and a vanity subdomain are not offered: there is no file store or DNS control in this
            deployment, and a button that cannot do its job is worse than none. The mark above appears everywhere a
            logo would.
          </p>
        </div>
      </div>
    </div>
  );
}
