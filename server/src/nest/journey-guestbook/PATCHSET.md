# Journey Guestbook — patch set

Comments + likes from email-verified public visitors on shared journeys, plus
owner moderation. Built to keep edits to **stock TREK** tiny so `git pull` from
upstream rarely conflicts. Everything else is net-new files.

## Net-new files (no merge risk)

Server — `server/src/nest/journey-guestbook/`:
- `guest-auth.service.ts` — magic-link issue/verify, commenter records, guest JWT.
- `guest-auth.controller.ts` — `POST :token/guest/request-link`, `GET guest/verify`, `GET :token/guest/me`.
- `journey-guestbook.service.ts` — comments/likes/settings SQL + per-journey summary.
- `guestbook-public.controller.ts` — public read (`:token/guestbook`, `:token/entries/:entryId/guestbook`) + writes (comment, like).
- `guestbook-owner.controller.ts` — authenticated `api/journeys/:id/guestbook/*` (list, delete, settings).
- `guestbook-cookie.ts` — the `trek_guest` cookie helper (reuses `common/cookie.ts#cookieOptions`).
- `guestbook.dto.ts` — `createZodDto` wrappers (required by the body-contract boot gate).
- `journey-guestbook.module.ts` — wires the above.

Shared:
- `shared/src/journey/guestbook.schema.ts` — Zod request schemas.

Client — `client/src/components/Journey/guestbook/`:
- `GuestbookProvider.tsx` / `GuestbookThread.tsx` — public per-entry UI (one fetch/journey).
- `OwnerGuestbookProvider.tsx` / `GuestbookOwnerThread.tsx` — owner moderation UI.

## Edits to existing files (re-apply these after an upstream pull)

Each is small and additive; the marker string tells you where.

| File | Edit |
|------|------|
| `server/src/db/migrations.ts` | Appended ONE migration fn at the end of the `migrations` array (creates the 5 guestbook tables). Must stay LAST — the array is index-addressed against `schema_version`. |
| `server/src/db/schema.ts` | Added the same 5 `CREATE TABLE IF NOT EXISTS` before the `migrations` bookkeeping table (fresh-install path). |
| `server/src/nest/app.module.ts` | 1 import + `JourneyGuestbookModule` in the `imports` array. |
| `server/src/nest/journey/journey-share.service.ts` | Added 2 methods: `journeyIdForToken`, `validateShareTokenForEntry` (share-token → journey, honoring `share_timeline` and skipping skeletons). |
| `server/src/nest/common/validate-route-guards.ts` | Added 7 entries to `PUBLIC_ROUTE_ALLOW_LIST` (the guestbook `@Public` routes). The boot gate fails if these drift. |
| `shared/src/index.ts` | 1 `export * from './journey/guestbook.schema'`. |
| `client/src/api/client.ts` | Added `guestbookApi` object after `journeyApi`. |
| `client/src/pages/JourneyPublicPage.tsx` | 2 imports; wrapped the page in `<GuestbookProvider token={token!}>`; mounted `<GuestbookThread entryId={entry.id}/>` at the bottom of each entry card. |
| `client/src/components/Journey/JourneyDetailPageEntryCard.tsx` | 1 import; mounted `<GuestbookOwnerThread entryId={entry.id}/>` at the end of `EntryCard`. |
| `client/src/pages/JourneyDetailPage.tsx` | 1 import; wrapped page in `<OwnerGuestbookProvider journeyId={current.id}>`. |
| `client/src/mobile/screens/journey/MJourneyDetail.tsx` | 2 imports; wrapped in `<OwnerGuestbookProvider journeyId={current.id}>`; mounted `<GuestbookOwnerThread entryId={entry.id}/>` after each `MJourneyEntryCard` (outside the card `<button>`). |

## Runtime notes

- Feature is gated by the **Journey addon** (off by default). Enable it in admin, or:
  `UPDATE addons SET enabled=1 WHERE id='journey';`
- Magic links use `getAppUrl()`. Set `APP_URL=https://trek.muchall.nl` so emailed links resolve; configure SMTP or the link is logged to stdout in a fenced block.
- Guest cookie `trek_guest` is httpOnly + (behind TLS) Secure; 90-day lifetime. The real "can still comment" gate is the per-journey open/closed toggle, enforced server-side.
- Per-journey comments toggle: owner `PUT /api/journeys/:id/guestbook/settings {commentsEnabled}`; default open.

## Follow-ups (v1 deferred)

- Guestbook UI strings are hardcoded English; move into the i18n namespaces (`shared/src/i18n/*/journey.ts`) for full localization.
