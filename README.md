# Party Invite Manager

A Next.js App Router + PostgreSQL + Prisma birthday invitation and RSVP application, ready to configure for Vercel. The implementation follows `birthday-party-invite-prd.md`, with Section 9 taking precedence over the draft model.

## Run locally

Requirements: Node.js 22+, npm, and PostgreSQL 17+ (or Docker).

```sh
npm ci
cp .env.example .env
# Set AUTH_SECRET and CRON_SECRET to separate random values:
openssl rand -hex 32
openssl rand -hex 32
# Paste the generated values into .env, then start PostgreSQL:
docker compose up -d
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open [localhost:3000](http://localhost:3000). Use the same origin configured in `APP_URL` (including `localhost` versus `127.0.0.1`). If using an existing PostgreSQL instance, set both database URLs and skip Docker. The migration and seed commands read `.env`; Next.js also loads it automatically.

The seed creates a published party about three weeks ahead, five invitees (attending, declined, pending/sent, pending/unsent), named additional attendees, private messages, and a second draft party. It prints each private RSVP link. Initial totals are **5 invited, 3 responded, 4 attending including family, 1 declined**.

Demo host: **demo@example.com** / **BirthdayDemo123!**. The seed is repeatable and does not overwrite an existing demo party. Demo seeding is disabled when `NODE_ENV=production`.

### Try the flows

1. Sign in as the demo host and open the garden birthday. Filter responses, inspect guest messages, edit party details, add/edit/remove an invitee, or paste/upload CSV.
2. Click **Send invitations**. In local preview mode, visit [/dev/mail](http://localhost:3000/dev/mail) to open the generated invitations. Preview emails do not claim to have been sent.
3. Open a guest link (an incognito window also works). Submit an RSVP with family members and a message. Switch attending → declined → attending; the dashboard and headcount update. The dashboard refreshes every 15 seconds.
4. Open another guest link. Only other confirmed guests’ names and their additional attendees’ names appear. Emails, notes, messages, pending guests, and declined guests are absent.
5. Sign out and create an account or request a magic link. Follow its link in `/dev/mail`. Verification and magic links require a confirmation click so email scanners do not consume them. Password reset uses the same inbox.

`/dev/mail` exposes local development email content, including sign-in links. It is deliberately unavailable in production and unless `EMAIL_MODE=preview`. Keep a preview-mode development server bound to your local machine.

## Environment variables

| Variable         | Purpose                                                                                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`   | PostgreSQL runtime URL; use your provider’s pooled connection on Vercel.                                                                            |
| `DIRECT_URL`     | Direct PostgreSQL connection used by Prisma migrations. Locally this can equal `DATABASE_URL`.                                                      |
| `APP_URL`        | Canonical application origin; used for email links and mutation-origin validation. Use HTTPS in production.                                         |
| `AUTH_SECRET`    | At least 32 random characters; HMAC key for session/auth-token hashes and rate-limit keys. Changing it revokes sessions and outstanding auth links. |
| `EMAIL_MODE`     | `preview` for local email capture; `resend` for real delivery. Preview is never enabled in production, regardless of this value.                    |
| `RESEND_API_KEY` | Resend API key, required for real delivery.                                                                                                         |
| `EMAIL_FROM`     | Sender on a verified Resend domain, e.g. `Party Invite Manager <invites@yourdomain.com>`.                                                           |
| `CRON_SECRET`    | Independent random secret for the email retry worker, sent as `Authorization: Bearer …`.                                                            |
| `TEST_APP_URL`   | Optional integration-test app origin; defaults to `http://localhost:3000`.                                                                          |

Never prefix server secrets with `NEXT_PUBLIC_` or commit `.env`.

## Email provider and reliability

**Resend** is used because its TypeScript SDK runs directly in Next.js Node route handlers on Vercel, accepts HTML and plain text, and provides [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys) for retry deduplication. No SMTP server is required.

`lib/email.ts` implements all four Section 6 templates: invitation, guest RSVP confirmation, host response notification, and reminder. Auth emails use the same escaped HTML/plain-text layout. Host notifications include names, relationships, message, and running headcount/response totals. Reminders include the current response state. Hosts can manually remind pending guests or use the individual invitation endpoint with `reminder: true`.

Emails are persisted in `NotificationLog`. RSVP changes and both notification records commit in one serializable transaction. Next.js `after()` starts delivery after the HTTP response; a provider error never rolls back an RSVP. Logs track attempts, pending/sending/sent/failed/preview states and errors. The host can see failures and manually retry/process pending mail. Concurrent workers claim records using a database lease. Retries use exponential backoff, at most five attempts, and the log ID as the provider idempotency key. Resend’s deduplication window is 24 hours, so delivery is at least once rather than an unlimited exactly-once guarantee.

`GET /api/cron/email` drains due work and removes expired auth/session/rate-limit records. `vercel.json` supplies a daily schedule compatible with basic cron availability. For prompt retries and larger lists, configure a supported frequent schedule (for example every five minutes) or an external authenticated scheduler. Immediate delivery also runs on every send/RSVP request. Without a scheduler, failed work remains visible and manually retryable; it does not retry itself in a stopped local process.

A `SENT` log means accepted by Resend, not proof of inbox delivery. Provider-side bounce/open tracking is not included. No open-tracking pixels are used. Real delivery requires your own verified domain and API key; preview-mode tests do not contact Resend.

## Data and behavior decisions

- `Party`, `Invitee`, `RsvpResponse`, `AdditionalAttendee`, `User`, and `NotificationLog` follow Section 5. Additional tables support sessions, expiring one-time auth tokens, and database-backed rate limits.
- `theme`, IANA `timeZone`, invitee `note`, and delivery metadata support the requested UI. UTC timestamps are stored in PostgreSQL; the form and email display use the event’s time zone. Nonexistent daylight-saving wall times are rejected; repeated fall-back times resolve to the first occurrence.
- There is **no max headcount field or attendee cap**. Infrastructure payload/time limits still apply to individual requests; CSVs can be imported in successive batches.
- Each invitee has one permanent cryptographically random 256-bit token. Editing/resending preserves it; deleting the invitee invalidates the link. Different children may share a guardian email. A token is a bearer credential: anyone holding that exact link can manage that invitee’s response. Do not share it publicly.
- Each invitee has at most one response (database unique constraint). Attending responses count one invited child plus each named additional attendee. Declining removes additional attendees. No implicit guardian is counted; add a parent explicitly when attending.
- Response changes in both directions are allowed until `rsvpDeadline ?? startDateTime`, with locking at or after that instant. The server enforces the cutoff on every write. Draft links return 404; cancelled parties are visible but locked. Past is derived from start time; persisted status remains draft/published/cancelled.
- Auth tokens and sessions are stored as HMAC hashes. Passwords use bcrypt with cost 12 and a 72-byte maximum. Sessions last 30 days and use HttpOnly, SameSite=Lax cookies (Secure and `__Host-` prefix in production). Verification, reset, and magic links expire in 30 minutes and are atomically consumed once. Password reset invalidates existing sessions.
- Every host resource checks party ownership. Guest endpoints never call host-session authentication. Guest API output is explicitly projected to omit other families’ private data. Mutation routes enforce JSON and reject foreign origins. API responses are private/no-store; referrer policy prevents invitation tokens leaking through outgoing requests. Cover images are HTTPS URLs loaded by the browser with no referrer.
- The rate limiter is database-backed to work across serverless instances. Production IP-based throttling assumes trusted proxy headers supplied by Vercel; custom reverse proxies should strip/replace incoming forwarding headers.

## REST API

All bodies are JSON. Successful creation returns 201, async email queueing 202, deletion 204. Errors use `{ "error": "…" }` with 400 (validation), 401 (session), 403 (verification/origin), 404 (missing/not owned), 409 (locked/conflicting), 415 (media type), or 429 (rate limit).

| Method               | Route                                  | Access / body                                                                                                |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| POST                 | `/api/auth/signup`                     | `{name,email,password}`; sends verification                                                                  |
| POST                 | `/api/auth/login`                      | `{email,password}`; verified hosts only                                                                      |
| POST                 | `/api/auth/magic-link`                 | `{email}`; also supports passwordless signup                                                                 |
| POST                 | `/api/auth/verify-email`               | `{email}`; resend verification                                                                               |
| POST                 | `/api/auth/forgot-password`            | `{email}`                                                                                                    |
| POST                 | `/api/auth/consume`                    | `{token,password?}`; password required for reset token                                                       |
| POST                 | `/api/auth/logout`                     | `{}`; revoke current session                                                                                 |
| GET                  | `/api/auth/me`                         | Current account summary or null                                                                              |
| GET / POST           | `/api/parties`                         | Host: list / create                                                                                          |
| GET / PATCH / DELETE | `/api/parties/:id`                     | Owning host: dashboard / edit / delete                                                                       |
| GET / POST           | `/api/parties/:id/invitees`            | Owning host: list / add record, array of records, or `{csv}`                                                 |
| PATCH / DELETE       | `/api/parties/:id/invitees/:inviteeId` | Owning host: edit / remove                                                                                   |
| POST                 | `/api/parties/:id/invitations`         | Owning host: `{scope:"unsent"\|"pending"\|"individual", inviteeId?, reminder?}`                              |
| GET / POST           | `/api/parties/:id/emails`              | Owning host: delivery logs / retry failed and process pending                                                |
| GET / PUT            | `/api/rsvp/:token`                     | **Token only, no host session**: invitation / `{status,message?,additionalAttendees:[{name,relationship?}]}` |
| GET                  | `/api/cron/email`                      | Bearer `CRON_SECRET`                                                                                         |

Party create requires `title`, `location`, `startDateTime` (ISO timestamp with offset), `timeZone`, and `status` (`DRAFT`, `PUBLISHED`, `CANCELLED`). Optional: `description`, `theme`, `endDateTime`, `rsvpDeadline`, `coverImageUrl`. PATCH accepts a subset. Invitees use `name`, `guardianEmail`, optional `note`. RSVP status is `ATTENDING` or `NOT_ATTENDING`.

Example CSV (paste or upload):

```csv
name,email,note
Sam,parent@example.com,From school
"Doe, Ella",parent@example.com,Soccer
```

CSV validation is atomic: any invalid row rejects the whole import. Reimporting a row intentionally adds another invitee; it does not silently merge children sharing an email. Review the list before sending.

## Verification

```sh
npm test
npm run typecheck
npm run build
# With a migrated local database, EMAIL_MODE=preview, and npm run dev running:
npm run test:integration
```

The unit suite checks privacy projection, headcounts, 501 additional attendees, cutoff equality, CSV parsing, HTML escaping, and timezone/DST behavior. The integration suite exercises real REST handlers and PostgreSQL: verification/login/magic link/reset, cross-origin denial, ownership isolation, atomic CSV import, token stability, queued email content, token-only RSVPs, decline reversal, concurrent updates, deadline/cancel/draft locking, and cascade deletion. It creates uniquely named test users and cleans up its own data. Run it only against a local preview-mode test app/database.

## Vercel deployment

1. Push this project to your Git provider and import it into Vercel using the Next.js preset and Node.js 22.
2. Provision PostgreSQL in a nearby region. Set pooled `DATABASE_URL` and unpooled `DIRECT_URL`; include SSL parameters required by your database provider. Set an appropriate connection limit for the database plan.
3. Configure all production variables above, including a canonical HTTPS `APP_URL`, fresh auth/cron secrets, `EMAIL_MODE=resend`, verified `EMAIL_FROM`, and `RESEND_API_KEY`. Configure preview deployments with their own database and exact app origin.
4. Apply committed migrations through a controlled release/CI step with `npm run db:migrate`. Do not run `prisma migrate dev` against production. The normal `npm run build` generates Prisma Client but does not mutate the database. Run migrations before deploying code that needs them.
5. Build with `npm run build`. Use Node route handlers, not Edge or static export. Keep Prisma available during the build; do not omit dev dependencies before building.
6. Enable the cron job and confirm `CRON_SECRET` is configured. Adjust its frequency to your Vercel plan and expected invitation volume. Inspect Email delivery in the host dashboard and monitor cron failures.
7. Verify a real signup → email link → party → invitation → RSVP → guest confirmation + host notification using addresses you control. Do not seed demo credentials into production.

The local app, migration, tests, and production build can run without an email API key in preview mode. Production delivery and deployment need your service credentials.

Out of scope: daily digests, automated guest reminders, OAuth, calendar sync, party duplication, CSV export, guest account history, shared/public links, and multi-host collaboration. Manual reminders are included.
