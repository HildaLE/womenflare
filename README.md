# WomenFlare

WomenFlare is split into two independently deployable projects:

```text
api/      Cloudflare Worker, Durable Object, D1 schema and admin API
mobile/   Expo application for iOS and Android
```

The mobile application calls the Worker directly through `EXPO_PUBLIC_API_URL`. The API does not build or serve the mobile frontend.

## Install

From the repository root:

```bash
npm install
```

## API

Copy `api/.dev.vars.example` to `api/.dev.vars`, then initialize and run the local database:

```bash
npm run db:migrate:local
npm run dev:api
```

The local API is available at `http://localhost:8787/api`. Authorized administrators are `hedimo@cloudflare.com`, `pseral@cloudflare.com`, and `mderoquemaurel@cloudflare.com`; the development password is `Cloudflare2026!`. Before deployment, verify the D1 binding and `ADMIN_EMAILS` allowlist in `api/wrangler.jsonc`, then configure `ADMIN_PASSWORD` and `SESSION_SECRET` as Worker secrets.

The browser administration console is available at `http://localhost:8787/admin` locally and at `/admin` on the deployed Worker. It can start, advance, or reset the session and create, edit, or delete questions.

Deploy only the backend with:

```bash
npm run db:migrate:remote
npm run deploy:api
```

## Mobile

Copy `mobile/.env.example` to `mobile/.env.local` and set the deployed Worker origin:

```text
EXPO_PUBLIC_API_URL=https://womenflare.YOUR-SUBDOMAIN.workers.dev
```

Then start Expo:

```bash
npm run dev:mobile
```

Native development builds can be launched from `mobile` with `npm run ios` or `npm run android`. Production builds can use EAS Build from that directory.

Store submission configuration and the required public URLs are documented in `mobile/STORE_SUBMISSION.md`:

- Privacy: `https://womenflare.hilda-demo-account1783.workers.dev/privacy/`
- Support: `https://womenflare.hilda-demo-account1783.workers.dev/support/`

## Verification

```bash
npm run typecheck
npm run lint
```
