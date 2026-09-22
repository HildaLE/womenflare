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

The local API is available at `http://localhost:8787/api`. The example admin login is `admin@cloudflare.com` with password `Cloudflare2026!`. Before deployment, replace the placeholder D1 `database_id` in `api/wrangler.jsonc` and configure `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and `SESSION_SECRET` as Worker secrets. Use a different production password.

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

## Verification

```bash
npm run typecheck
npm run lint
```
