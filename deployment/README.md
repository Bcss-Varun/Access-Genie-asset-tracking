# Production deployment

The application is an Express API plus a static Vite SPA. `npm start` serves
only the API; it does not serve `frontend/dist`. Use Node >=20.19 and MongoDB.

1. Install the locked dependencies with `npm ci`. Configure `backend/.env`
   from its example without committing credentials. Set `NODE_ENV=production`,
   distinct random JWT secrets, the explicit database name and URI,
   `HOST=127.0.0.1`, `PORT=4000`, `TRUST_PROXY_HOPS=1`,
   `CORS_ORIGIN=https://assets.example.com`, `COOKIE_SECURE=true`, and
   `COOKIE_SAME_SITE=strict`. Disable demo personas. Only use one trusted proxy
   with this hop count and prevent direct access to port 4000.
2. Set `VITE_API_URL=/api/v1` when building and run `npm run build` from the
   repository root. Vite settings are build-time values; rebuild after changes.
   Match the API prefix on both sides. Never place secrets in `VITE_*` variables.
3. For a new estate only, set a unique `ADMIN_PASSWORD`, administrator email and
   name, then run `npm run seed`. Re-running this command resets that password.
   Do not run `seed:fresh` on an existing estate. Demo seeding is prohibited in
   production. The normal API process does not require ADMIN_PASSWORD.
4. Run `npm run db:indexes` against the intended database after reviewing index
   changes. In particular MFA challenge expiry and session expiry require TTL
   indexes. Keep database access private and use a least-privilege database user.
5. Run `npm start` under your process supervisor with the backend configuration
   loaded. Customize `nginx.conf.example`, provide your TLS certificate, validate
   it with `nginx -t`, and serve the built frontend through that proxy. Static
   nested routes fall back to index.html; API paths must never use that fallback.
6. Verify `/health`, sign-in, MFA, refresh after reload, password change and logout
   through the real HTTPS hostname. Inspect Secure/HttpOnly/SameSite and cookie
   Path in the browser, verify rejected foreign origins and check proxy/client IP
   behavior. SIGTERM allows active HTTP requests to finish (10-second ceiling).

`npm run test:security` builds and tests a separate disposable MongoDB/API,
including the compiled production entry point. It verifies production cookie
headers over loopback; it does not certify hosted TLS, DNS, proxy configuration,
browser cross-site cookie policy, SMTP or infrastructure recovery. The nginx
example has not been installed or run here.

Access tokens issued before this session-binding change must be renewed. A valid
refresh cookie can renew them. Sessions now have stable IDs across rotation, and
logout/password changes/revocation take effect on existing access tokens. MFA
challenges persist in MongoDB and support multiple API instances. MFA enrollment
consumes the enrollment TOTP step; use a fresh code for a subsequent sign-in.
Existing authenticated sessions remain valid when MFA is enabled; use Sign out
all devices to terminate them. Recovery/password/role changes invalidate pending
MFA challenges where applicable.

Legacy global platform records lack tenant ownership. API keys, webhooks,
integrations, backups, invoices, teams, support and exports therefore require a
platform administrator. Global rules/settings can only be changed by that role.
Scoped approval workflows stay editable inside the caller's estate. No legacy
data was migrated. Unaddressed legacy notification broadcasts are excluded from
personal inboxes; unscoped historical audit rows are visible only at platform
scope. Keep a reviewed backup and previous release artifact for rollback;
restoring a database is an operator procedure, not the disabled in-app button.
