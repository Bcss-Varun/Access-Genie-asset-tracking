import { useEffect, useState } from 'react';
import { FormDialog, Field, TextInput } from '@/components/ui/FormDialog';
import { useToast } from '@/components/providers/ToastProvider';
import { authApi, type MfaSetup } from '@/api/auth-endpoints';
import { ApiRequestError } from '@/api/client';
import { encodeQr } from '@/lib/qr';

/**
 * Turning multi-factor authentication on and off.
 *
 * Enrolment is two steps because it has to be: the server mints a secret, and
 * MFA is only switched on once a code generated *from that secret* comes back.
 * Skipping the proof would let somebody lock their account behind a QR code
 * they never scanned.
 *
 * These do not go through `useMutate`: none of them changes the reference
 * dataset, and refetching it after enrolling a second factor would be a
 * needlessly large round trip.
 */

/** The secret rendered as a scannable code, using the app's own QR encoder. */
function QrCode({ uri }: { uri: string }) {
  // `L` rather than `M`: an otpauth URI is long, and the lowest error
  // correction keeps the symbol small enough to scan comfortably on screen.
  const matrix = encodeQr(uri, 'L');
  const size = matrix.length;
  const scale = 5;
  const quiet = 4;
  const dimension = (size + quiet * 2) * scale;

  return (
    <svg
      viewBox={`0 0 ${dimension} ${dimension}`}
      className="h-48 w-48 shrink-0"
      role="img"
      aria-label="Authenticator setup QR code"
      shapeRendering="crispEdges"
    >
      <rect width={dimension} height={dimension} fill="#fff" />
      {matrix.map((row, y) =>
        row.map((on, x) =>
          on ? (
            <rect
              key={`${x}-${y}`}
              x={(x + quiet) * scale}
              y={(y + quiet) * scale}
              width={scale}
              height={scale}
              fill="#0f172a"
            />
          ) : null,
        ),
      )}
    </svg>
  );
}

/** Codes shown once, with a copy button — there is no second chance to see them. */
function CodeList({ codes, onCopy }: { codes: string[]; onCopy: () => void }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3">
        {codes.map((code) => (
          <code key={code} className="font-mono text-sm tracking-wide text-slate-800">
            {code}
          </code>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(codes.join('\n'));
          onCopy();
        }}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
      >
        Copy all
      </button>
      <p className="text-xs text-slate-500">
        Each works once, in place of a code from your app. Store them somewhere you can reach without this device.
      </p>
    </>
  );
}

export function MfaSetupDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Minted on open. Doing it here rather than on submit means the QR code is
  // there to scan while the person reaches for their phone.
  useEffect(() => {
    let cancelled = false;
    authApi
      .beginMfaSetup()
      .then((result) => {
        if (!cancelled) setSetup(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiRequestError ? err.message : 'Could not start setup.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await authApi.enableMfa(code);
      setRecoveryCodes(result.recoveryCodes);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'That code was not accepted.');
    } finally {
      setBusy(false);
    }
  };

  if (recoveryCodes) {
    return (
      <FormDialog
        icon="🛟"
        title="Multi-factor authentication is on"
        description="Save these recovery codes before you close this. They are not shown again."
        submitLabel="I have saved them"
        cancelLabel="Close"
        onSubmit={onDone}
        onCancel={onDone}
      >
        <CodeList codes={recoveryCodes} onCopy={() => toast({ title: 'Copied', description: 'Recovery codes are on your clipboard.', tone: 'success' })} />
      </FormDialog>
    );
  }

  return (
    <FormDialog
      icon="🔐"
      title="Set up multi-factor authentication"
      description="Scan the code with any authenticator app, then enter the six digits it shows."
      submitLabel="Verify & enable"
      busy={busy}
      disabled={!setup || code.replace(/\D/g, '').length !== 6}
      onSubmit={() => void enable()}
      onCancel={onClose}
    >
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {setup ? (
        <>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <QrCode uri={setup.otpauthUri} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-600">
                Scan this with Google Authenticator, 1Password, Authy, or any other TOTP app.
              </p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Or enter this key by hand
              </p>
              <code className="mt-1 block break-all rounded-lg bg-slate-50 p-2 font-mono text-xs text-slate-700">
                {setup.secret}
              </code>
            </div>
          </div>

          <Field label="Code from your app" required hint="Six digits. It changes every 30 seconds.">
            <TextInput
              autoFocus
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              className="font-mono text-lg tracking-[0.4em]"
            />
          </Field>
        </>
      ) : (
        !error && <p className="text-sm text-slate-500">Generating a secret…</p>
      )}
    </FormDialog>
  );
}

export function MfaDisableDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disable = async () => {
    setBusy(true);
    setError(null);
    try {
      await authApi.disableMfa(password);
      onDone();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not turn it off.');
      setBusy(false);
    }
  };

  return (
    <FormDialog
      icon="⚠️"
      title="Turn off multi-factor authentication?"
      description="Your account will be protected by its password alone. Your recovery codes are destroyed."
      submitLabel="Turn it off"
      busy={busy}
      disabled={password.length === 0}
      onSubmit={() => void disable()}
      onCancel={onClose}
    >
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* An unlocked screen is not consent for removing a factor. */}
      <Field label="Confirm your password" required>
        <TextInput
          autoFocus
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}

export function RecoveryCodesDialog({ onDone, onClose }: { onDone: () => void; onClose: () => void }) {
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  const regenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await authApi.regenerateRecoveryCodes(password);
      setCodes(result.recoveryCodes);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not issue new codes.');
    } finally {
      setBusy(false);
    }
  };

  if (codes) {
    return (
      <FormDialog
        icon="🛟"
        title="New recovery codes"
        description="Your previous codes no longer work. Save these before closing."
        submitLabel="I have saved them"
        cancelLabel="Close"
        onSubmit={onDone}
        onCancel={onDone}
      >
        <CodeList codes={codes} onCopy={() => toast({ title: 'Copied', description: 'Recovery codes are on your clipboard.', tone: 'success' })} />
      </FormDialog>
    );
  }

  return (
    <FormDialog
      icon="🛟"
      title="Regenerate recovery codes"
      description="Issuing a new set immediately invalidates the old one."
      submitLabel="Issue new codes"
      busy={busy}
      disabled={password.length === 0}
      onSubmit={() => void regenerate()}
      onCancel={onClose}
    >
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Field label="Confirm your password" required>
        <TextInput
          autoFocus
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
    </FormDialog>
  );
}
