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

### Session lifecycle

A single Durable Object named `main-event` holds the whole live session. It moves through five phases:

```text
waiting --start--> question (15 s) --auto--> reveal (5 s) --auto--> checkpoint --next--> question ...
                                                                        |
                                                            after 20 questions: finished
```

- Participants can join only during `waiting`, and display names must be unique.
- A correct answer is worth 500 points plus up to 500 more for speed, so 1 000 maximum.
- `question -> reveal -> checkpoint` is automatic, driven by Durable Object alarms. Only `checkpoint -> question` needs an administrator, which is what the **Question suivante** button does.
- All participant data lives in Durable Object storage, never in D1. It is erased immediately when an administrator presses **Réinitialiser**, and otherwise by an automatic alarm 24 hours after the last question. Resetting after the event is the fastest way to leave nothing behind.

### Administration console

The browser console is available at `http://localhost:8787/admin` locally and at `/admin` on the deployed Worker. Sign in with an allowlisted address; the bearer token is kept in `sessionStorage` and expires after eight hours.

The session panel at the top is always visible and drives the live quiz:

| Control | Available when | Effect |
| --- | --- | --- |
| Lancer le quiz | phase is `waiting` | Loads the first 20 questions by `position` and starts question 1 |
| Question suivante | phase is `checkpoint` | Starts the next question |
| Réinitialiser | always | Deletes the session and every participant |

There is deliberately no reveal button: the answer and the leaderboard appear on their own.

Three tabs sit below the panel:

- **Questions** — create, edit, delete. Exactly 20 questions must exist or the quiz refuses to start.
- **Ressources** — create, edit, delete the help resources listed in the mobile application.
- **Projection** — a preview of the public `/ecran/` page, described next.

### Projection screen

`/ecran/` is a public page, with no login of any kind, meant to be opened on the machine driving the video projector. It mirrors the live session for the room in the spirit of Kahoot. The discreet **Plein écran** button in the corner hands it to the projector; everything else is automatic, there is nothing to click during the event.

The same stage is also available as the **Projection** tab of the admin console, as a preview for the operator. Both read the same data and share `api/public/stage.css`.

| Phase | The stage shows |
| --- | --- |
| `waiting` | Holding screen and the number of connected participants |
| `question` | Category, prompt, options A/B/C, countdown, and `n / N réponses reçues` |
| `reveal` | Correct option highlighted in green, votes received per option, explanation |
| `checkpoint` | Palmarès: top five participants and their scores, after every question |
| `finished` | The same ranking, titled `Classement final` |

It reads `GET /api/session/board` once per second. That route is public, so keep in mind what it deliberately does and does not expose:

- During the `question` phase it returns no correct answer, no explanation and no vote counts. The URL therefore cannot be used to cheat while a question is open.
- From the `reveal` phase onward it returns the correct answer, the number of votes per option, the explanation, and the first names or pseudonyms of the top five with their scores. This is the same information the room sees on the projector.

Typical event setup: the operator keeps `/admin/` on the laptop for **Lancer le quiz** and **Question suivante**, while `/ecran/` runs fullscreen on the projector display.

### API routes

Public routes need no credentials; a participant is identified by the opaque `playerId` returned at join time. Every `/api/admin/*` route requires `Authorization: Bearer <token>` from `POST /api/admin/login`.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness check, also pings D1 |
| `GET /api/resources` | Help resources and the legal disclaimer shown in the application |
| `POST /api/session/join` | Join during `waiting`, returns `playerId` and the initial state |
| `GET /api/session/state?playerId=` | Participant view of the session, polled twice per second by the application |
| `POST /api/session/answer` | Submit `optionIndex` for the current question |
| `GET /api/session/board` | Room view used by `/ecran/`: vote counts and top five, nothing revealing while a question is open |
| `POST /api/admin/login` | Exchange email and password for a token, rate limited |
| `GET /api/admin/session/state` | Session state for the control panel |
| `POST /api/admin/session/start` \| `next` \| `reset` | Drive the session |
| `/api/admin/questions`, `/api/admin/resources` | Full CRUD, `GET` `POST` `PUT /:id` `DELETE /:id` |

Errors always use the same envelope, with French messages:

```json
{ "error": { "code": "invalid_phase", "message": "La question en cours doit être terminée." } }
```

### Deploy

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
