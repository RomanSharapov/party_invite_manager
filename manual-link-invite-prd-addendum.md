# PRD Addendum: Manual Link Invite Delivery (SMS / Other Channels)

This addendum extends the original **Birthday Party Invite Manager PRD**. It
should be handed to the implementing agent alongside the original PRD. Where
this document doesn't mention something, the original PRD still applies
unchanged.

## 1. Problem Statement
Hosts sometimes know a caregiver's mobile phone number but not their email
address. The app does not send SMS messages (this would incur cost and is
out of scope). Instead, the Host should be able to generate the same
unique, personalized RSVP link used for email invites, copy it, and paste
it into their own SMS/messaging app to send manually. The invitee follows
the same RSVP workflow as email invitees, with one difference: since no
email address is on file, they won't automatically receive an emailed
confirmation — unless they choose to provide one during RSVP.

**Explicitly out of scope:** The app does not send SMS/text messages
itself, does not integrate with any SMS/carrier API, and never charges or
consumes an SMS-sending budget. "Manual link" delivery is purely a Host
copy-paste workflow.

## 2. Feature Summary
- When adding an invitee, the Host picks a **delivery method**: **Email**
  or **Manual Link**.
- **Email** invitees work exactly as in the original PRD (guardian email
  required, app sends the invitation email).
- **Manual Link** invitees require a name **and at least one of** guardian
  email or phone number (both are optional individually, but at least one
  must be provided so the Host has some way to actually deliver the
  link). An optional phone number, when provided, is also used
  client-side to build an `sms:` link (see §2.1) — it is still never
  transmitted by the app or used to call any SMS/carrier API.
- Every invitee, regardless of delivery method, still gets exactly one
  unique, unguessable token and RSVP link (no change to the existing
  one-token-per-invitee security model).
- The Host gets sharing actions for any invitee's personalized RSVP link,
  layered by capability (see §2.1): Web Share, `sms:` link, and Copy Link.
  These are available in addition to — not instead of — the "Send Invite
  Email" action for Email invitees.

### 2.1 Sharing Mechanism (layered)
On the invitee row, the Host sees one primary action button, resolved in
this priority order at render time:
1. **Web Share** — if `navigator.share` is available in the Host's
   browser (typically mobile), show a single **"Share Invite"** button
   that calls `navigator.share({ title, text, url })`. This opens the
   native share sheet (Messages, WhatsApp, Telegram, Mail, etc.), letting
   the Host pick any channel and any contact, independent of whether a
   phone number is on file.
2. **`sms:` link** — else, if the invitee has a phone number on file, show
   a **"Text Invite"** button using an `sms:` href with the recipient
   number and a prefilled body, opening the Host's native SMS app with
   the message ready to send.
3. **Copy Link** — always available regardless of the above, as the
   universal fallback (desktop, unsupported browsers, or the Host just
   wants to paste it somewhere else).

The prefilled/shared message text (used in both Web Share's `text` field
and the `sms:` link's `body` param) reuses the same copy as the email
invitation (see original PRD §6), adapted to plain text — e.g., "You're
invited to [Party Title]! RSVP here: [link]" — so the Host doesn't need to
compose anything themselves.

Using Copy Link, Web Share, or the `sms:` link all update the same
`link_copied_at`-style signal on the invitee record (see §4.1) — a single
"link shared" indicator regardless of which of the three mechanisms was
used.
- The invitee dashboard row records a lightweight **"Link Shared"**
  signal (timestamp) when the Host uses Web Share, the `sms:` link, or
  Copy Link — whichever mechanism was actually used, it's tracked the
  same way. This is purely an informal indicator that the Host has taken
  an action — it is not proof the link was actually delivered or opened.
- On the RSVP page itself, a guest who arrived via a Manual Link invitee
  record (i.e., no email on file) is offered an **optional email field**
  during RSVP submission: "Want a confirmation? Enter your email
  (optional)." If provided, it's used to send the standard RSVP
  confirmation email and is saved to the invitee record for future
  reference (e.g., reminders, future parties).
- Regardless of whether an email is captured, the on-screen confirmation
  after RSVP submission includes a **"Add to Calendar" (.ics download)**
  button so the guest has something concrete to save even without an
  emailed confirmation.

## 3. Updated User Flows

### 3.1 Host: Add a Manual-Link Invitee
1. From the invitee-add form, Host selects delivery method: **Email** or
   **Manual Link**.
2. If Manual Link: Host enters the invitee's (child's) name, and must
   provide at least one of: guardian email or phone number (both fields
   shown; form validation requires at least one to be filled). An
   optional note field is also available.
3. Invitee record is created immediately with a unique token — no email is
   sent automatically (there's no "Send Invite Email" action for this
   invitee unless/until an email is on file).
4. Host uses the invitee row's sharing action — **Share Invite** (Web
   Share, if supported), **Text Invite** (`sms:` link, if a phone is on
   file and Web Share isn't available), or **Copy Link** — to get the
   personalized RSVP URL to the recipient. A `link_shared_at` timestamp is
   recorded when any of these is used.
5. If using Copy Link or a share sheet's non-SMS option, the Host pastes
   or sends the link manually — entirely outside the application. If
   using Web Share or the `sms:` link, the native app (Messages, WhatsApp,
   etc.) opens with the message ready to send.

### 3.2 Guest: Respond via Manual Link
1. Guest receives the link via text (or however the Host shared it) and
   taps it.
2. Same RSVP landing page as the email flow: party details, Attending /
   Not Attending, additional attendees, optional message.
3. Additionally shown: an optional "Email (optional) — get a confirmation"
   field.
4. Guest submits.
   - If they provided an email: standard RSVP confirmation email is sent,
     and that email is saved onto the invitee record.
   - If they didn't: no confirmation email is sent.
5. Confirmation screen (shown in both cases) includes RSVP summary plus an
   **"Add to Calendar"** button that downloads an `.ics` file with the
   party's date, time, and location.
6. Guest can return to the same link later to update their response, same
   rules as the email flow (allowed up until RSVP deadline/event date).

### 3.3 Host: Dashboard View
- Invitee list shows delivery method (Email / Manual Link) per invitee.
- For Manual Link invitees: shows "Link Shared [timestamp]" if applicable,
  or "Not yet shared" if the Host hasn't used any sharing action yet.
- If a Manual Link guest supplied an email during RSVP, it now appears on
  their invitee record in the dashboard (useful for the Host to reuse for
  future parties).

## 4. Data Model Changes

### 4.1 Invitee (extends existing table from original PRD §5.3)
- `delivery_method` (enum: `email` | `manual_link`) — required, set at
  creation.
- `guardian_email` — now **nullable** at the DB level. Required when
  `delivery_method = email`. For `delivery_method = manual_link`,
  application-level validation requires at least one of `guardian_email`
  or `phone` to be present (not enforced by a DB constraint, since it's a
  conditional-OR rule best handled in the API/form layer). May also be
  populated later for a `manual_link` invitee if the guest supplies it
  during RSVP.
- `phone` (nullable, free text/E.164-ish format) — used for the
  `sms:` share link's recipient field when present; otherwise purely
  informational. Never used by the app to send anything server-side.
- `link_shared_at` (nullable timestamp) — updated whenever the Host uses
  any of Web Share, the `sms:` link, or Copy Link.
- `invite_token` — unchanged; still generated for every invitee regardless
  of delivery method.
- `invite_status` — for `manual_link` invitees, "sent" is never
  auto-applied by the system (there's no send event the app can observe);
  status effectively tracks Pending vs. Responded, with `link_shared_at`
  shown as a supplementary signal rather than a formal status value.

No changes to RSVP Response or Additional Attendee tables from the
original PRD.

## 5. Email/Notification Changes
- **Invitation email:** only sent for `delivery_method = email` invitees
  (unchanged from original PRD).
- **RSVP confirmation (to Guest):** sent only if an email address exists
  on the invitee record at time of submission — either because
  `delivery_method = email`, or because a `manual_link` guest supplied one
  during RSVP.
- **Response notification (to Host):** unchanged — always sent, regardless
  of the invitee's delivery method, since the Host always has an account
  and email.

## 6. Non-Functional / Security Notes
- No new server-side attack surface for SMS sending, since the app never
  sends SMS itself — the `sms:` link and Web Share both hand off entirely
  to the Host's own device/apps. `phone` is only ever used client-side to
  construct an `sms:` href; it is never transmitted to any third-party
  API by the backend.
- Token generation and one-token-per-invitee remain unchanged — Manual
  Link invitees are exactly as secure as Email invitees; the only
  difference is who transmits the link.
- The optional email field captured mid-RSVP must go through the same
  validation as any other guest input (format validation; treat as
  untrusted input — see security-testing PRD for injection/XSS handling
  expectations already covered for other free-text fields).
- Clipboard-copy should degrade gracefully (e.g., fallback "select the
  link text" UI) on browsers/contexts where clipboard API access is
  restricted.

## 7. Decisions (Resolved)
1. **Invitee creation:** explicit delivery-method picker (Email vs. Manual
   Link) per invitee, not a generic "email optional" field.
2. **Manual Link contact requirement:** at least one of guardian email or
   phone must be provided (both optional individually; not both required).
3. **Sharing mechanism:** layered — Web Share API when available, else an
   `sms:` link when a phone number is on file, else Copy Link — all
   updating the same `link_shared_at` signal.
4. **Prefilled message text:** reuses the same copy as the email
   invitation (adapted to plain text), so the Host doesn't compose
   anything themselves.
5. **Guest confirmation without email:** guest may optionally enter their
   email during RSVP to receive a confirmation; regardless, the
   confirmation screen offers an `.ics` calendar download.

## 8. Out of Scope (this feature)
- Actually sending SMS/text messages from the app.
- Tracking whether the Host actually sent the copied link, or whether the
  guest actually opened it (only that it was copied).
- Bulk "Copy Link" for multiple Manual Link invitees at once (Host copies
  one at a time in v1; batch copy/export could be a fast-follow).
