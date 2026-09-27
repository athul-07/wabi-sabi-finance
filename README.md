# Wabi Sabi — Sales & Rentals

This app uses **Supabase for all persistent business data, authentication, user
profiles, roles, access permissions, and appearance preferences**. There is no
local database fallback, custom password store, signing secret, automatic seed,
or default owner password. The browser keeps only a protected session cookie;
credentials and business records are not persisted in localStorage.

## Connect the database

1. Install Node.js 22.17+ and run `npm install` (`npm.cmd` in restricted PowerShell).
2. Run `supabase/schema.sql` in the Supabase SQL Editor. It can also upgrade the
   earlier database schema; existing shop data is preserved.
3. Use the shop data already imported into Supabase. For a new empty shop only,
   run `supabase/initialize-empty.sql`. No local seed or sample data is loaded.
4. Configure `.env` using `.env.example`. Required values:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your_publishable_key
SUPABASE_SECRET_KEY=your_server_only_secret
APP_ORIGIN=http://localhost:4000
```

The existing `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` names are supported. A legacy
`SUPABASE_SERVICE_ROLE_KEY` is accepted instead of the secret key. The secret key
stays on the server. There is no `DB_ENGINE` or `JWT_SECRET` setting anymore.

For deployment set `NODE_ENV=production`, serve over HTTPS, and set `APP_ORIGIN`
to the exact public origin (no trailing slash). Secure cookies require HTTPS.
Disable public signups in Supabase Auth: staff are created by an administrator.
Even if signups remain enabled, unprovisioned accounts receive no app profile or
workspace access. Supabase Auth applies its configured password and rate policies;
the app requires new passwords to be 12–128 characters.

## Create the first owner

There is **no default login**. Set `WABI_NEW_USER_PASSWORD` temporarily in your
terminal, then run:

```bash
npm run setup:admin -- owner owner@example.com "Owner"
```

On PowerShell, read the password without putting it in command history:

```powershell
$ownerPassword = Read-Host 'New owner password (12+ characters)' -AsSecureString
$env:WABI_NEW_USER_PASSWORD = [System.Net.NetworkCredential]::new('', $ownerPassword).Password
npm.cmd run setup:admin -- owner owner@example.com "Owner"
Remove-Item Env:WABI_NEW_USER_PASSWORD
Remove-Variable ownerPassword
```

This creates a real Supabase Auth account and a linked database profile in one
provisioning operation. It verifies the profile is saved before reporting success,
and removes the new Auth account if saving its profile fails. The command refuses
to bootstrap another owner if an admin exists.
Start with `npm start`, then sign in using your chosen username and password.
Use **Users & access** to add staff with an email, username, name, and password.
Sales and Rentals default to write access. Roles, access changes, and deletions
are stored in Supabase. Deleting an account removes its profile through the
foreign key. The database prevents removal of the final administrator.

For administrative CLI provisioning, `npm run adduser -- username email [name]`
uses the same temporary password environment variable and creates a staff account.
This CLI requires the server secret and should only run on a trusted machine.

## Existing accounts and migration

Old custom logins are **not** Supabase Auth accounts and cannot sign in anymore.
Create the owner and recreate staff with their real email addresses and new
passwords. After verifying those accounts, run `supabase/cleanup-legacy-auth.sql`
to remove the obsolete `wabi_users` password table from the earlier integration.
The local seed and exporter have been removed. The application never opens
SQLite, local JSON stores, or the legacy `data/` directory. Any remaining legacy
files can be removed manually; they have no runtime role.

To check the live database connection, open `/api/health`. It queries Supabase
before returning `{"ok":true,"engine":"supabase"}`. Missing credentials, missing
shop records, and database failures produce errors instead of local sample data.

`npm run import -- path/to/workbook.xlsx` imports workbook records directly into
Supabase and replaces shop data. Version checks reject concurrent changes.

## Authentication and access

Supabase Auth owns passwords and sessions. `@supabase/ssr` handles session cookies
and refresh rotation. Cookies are HttpOnly, SameSite=Lax, and Secure in production.
Every protected request verifies the user with Supabase Auth, checks the live
session in `auth.sessions`, and loads the current profile from the database.
Logout revokes the current session. Password changes sign out all sessions;
admin password resets revoke the target user's sessions. Cross-origin mutations
are rejected, and API responses are marked `no-store`.

`wabi_profiles` stores usernames, names, email addresses, roles, page permissions,
and preferences. It references `auth.users`; it stores no passwords. Profiles are
created only from trusted `app_metadata` provided by administrative provisioning.
`wabi_kv` stores the shop document as JSONB, including customers, inventory, sales,
rentals, transactions, settings, and a version for atomic conflict checks. Both
tables deny direct browser access through grants and row-level security.

Staff permissions are checked on the server for reads and writes. Order-entry
screens receive customer names/phones and stock lookup fields they need, even
without Customers/Inventory page access. Hidden inventory costs and manual ledger
entries are omitted. Dashboard, Transactions, and Customers summary access also
requires related order information for totals. Appearance is saved per account.

## Development and verification

### Deploy on Vercel

Use the Express preset and repository root (`./`). `vercel.json` sets the build
command to `npm run build`; leave Output Directory at its Express preset default.
Vercel serves frontend assets from `public/` and uses the root `app.js` export
for the API. Local `npm start` still uses `src/server.js`.

Add `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
`NODE_ENV=production`, and `APP_ORIGIN=https://your-actual-deployment-domain`
in Vercel's environment variables. Use the exact HTTPS origin, without a trailing
slash. Never use the localhost value in production. If the assigned domain differs,
update `APP_ORIGIN` and redeploy before testing login or writes. Preview deployments
need an origin matching their own URL; a production-only origin rejects preview
mutations. No `PORT` override is needed.

Push these files to the connected GitHub branch before deploying. `.vercelignore`
excludes local secrets, legacy data files, test doubles, and test artifacts.
After deployment, `/api/health` must return `{"ok":true,"engine":"supabase"}`;
then verify sign-in and a save. The existing Supabase schema/data/accounts are reused.

```bash
npm run build
npm test
```

API/browser tests use explicit service doubles under `tests/`; they cannot be
selected by the production server. SQL tests execute the schema against an
isolated Postgres-compatible PGlite instance. The SSR test exercises actual cookie
serialization against a mock Auth endpoint. Hosted Supabase verification still
requires a configured project, applied SQL, and a real Auth account.

Browser tests use Edge on Windows and Chromium elsewhere. Tests never read or
write the production database. Runtime entry points are `src/server.js` (startup),
`src/app.js` (API), `src/auth-client.js` (cookie sessions), and `src/supabase-db.js`
(database adapter). `/api/health` reports the selected Supabase engine.

