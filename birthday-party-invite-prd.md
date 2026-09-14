# Product Requirements Document: Birthday Party Invite Manager

## 1. Overview

### 1.1 Problem Statement
Parents organizing kids' birthday parties currently rely on group texts, paper invites, or generic event tools (Evite, Paperless Post) that don't handle the specific needs of managing a roster of kid invitees, their accompanying siblings, and RSVP details in a lightweight, purpose-built way.

### 1.2 Product Summary
A web application that lets a parent ("Host") create a birthday party event with details (place, date, time, theme, etc.), invite a list of guests by name and email, and send email invitations. Invited parents ("Guests") can sign up or log in, respond Yes/No to the invite, indicate which additional family members (e.g., siblings) are attending, and leave an optional message. The Host receives an email notification after each response and can view a dashboard of all responses for their events.

### 1.3 Goals
- Make it fast for a Host to create a party and invite a list of guests.
- Make it effortless for a Guest to RSVP without friction (minimal signup barrier).
- Give the Host real-time visibility into who's coming, who's not, and headcount (including siblings).
- Keep the Host informed via email as responses come in.

### 1.4 Non-Goals (v1)
- Payment/gift registry integration.
- Multi-host collaboration on a single event.
- SMS/text notifications (email only for v1).
- Public/discoverable events (all events are private, invite-only).
- Calendar sync (e.g., auto-adding to Google Calendar) — may be a fast-follow.

---

## 2. User Roles

| Role | Description |
|---|---|
| **Host** | Creates and manages parties, invites guests, views responses. Must have an account. |
| **Guest (Invitee's parent)** | Receives invitation email, signs up/logs in, RSVPs on behalf of their child (and optionally siblings). |
| **(Implicit) Invitee** | The child being invited. Not a system user — represented as a name/email record tied to a guardian's email. |

Note: A single person could be both a Host (for their own kid's party) and a Guest (invited to another party). One account type serves both roles.

---

## 3. Core User Flows

### 3.1 Host: Create a Party
1. Host logs in / signs up.
2. Host clicks "Create Party."
3. Host fills in party details (see Data Model §5.1).
4. Host saves party as a draft or publishes it directly.

### 3.2 Host: Invite Guests
1. From a party's management page, Host adds invitees individually (name + email) or via bulk import (CSV paste or upload).
2. Host reviews the invite list.
3. Host clicks "Send Invitations" — triggers an email to each invitee's email address.
4. Host can add more invitees and send follow-up invitations later; can resend an invite to a specific person.

### 3.3 Guest: Receive and Respond to Invitation
1. Guest receives an email with party details and a unique invitation link.
2. Guest clicks the link, lands on an invitation landing page showing party details.
3. If not logged in: Guest is prompted to sign up or log in. (See §3.5 for frictionless options.)
4. Guest responds:
   - **Attending** or **Not Attending** (required).
   - If Attending: specify additional attendees (e.g., sibling names) — optional, repeatable field, no cap on number of additional attendees.
   - Optional free-text message to the Host.
5. Guest submits response. Confirmation shown on screen and via email.
6. Guest can return later and change their response (including switching from "Not Attending" back to "Attending") up until the RSVP deadline if one is set, or the event date otherwise. Once the deadline (or event date) has passed, responses are locked and can no longer be changed.
7. On the invitation/RSVP page, the Guest can also see the names of other invitees who have responded "Attending" (and their additional attendees), so parents can see who else is going. Declined invitees, invitees who haven't yet responded, and any RSVP messages are not shown to other Guests — only names of confirmed attendees are visible.

### 3.4 Host: Get Notified and View Responses
1. Each time a Guest submits or updates an RSVP, the Host receives an email notification with a summary (who responded, status, headcount, message).
2. Host logs in and views a per-party dashboard: list of invitees, response status (Pending / Attending / Not Attending), total headcount, and any messages.
3. Host can export the guest/response list (CSV) — nice-to-have for v1, useful for print-outs/goodie bags.

### 3.5 Frictionless Login Consideration
Since Guests are external parents who didn't choose to sign up proactively, minimize friction:
- Support "magic link" login (email-based, passwordless) as the primary auth method for Guests, in addition to standard email/password.
- The invitation link itself can pre-authenticate the Guest for that specific invitation (tokenized link), allowing them to RSVP without a full account, while still offering an optional "create an account to manage your invites" step.
- Recommendation: allow **lightweight RSVP via token link without forcing full signup**, but require an account (or at least a verified email) if the Guest wants to view a history of past responses across parties.

---

## 4. Feature Requirements

### 4.1 Authentication & Accounts
- **Hosts:** Email/password signup and login, plus a passwordless/magic-link option. Password reset flow. Email verification on signup.
- **Guests:** Not required to create a password-based account. The tokenized invite link (one unique token per invitee, see §4.3) is sufficient authentication to view the party and submit/update an RSVP for v1. Guests may optionally create a full account later (fast-follow) if they want a cross-party history, but this is not required for v1.
- (Optional, fast-follow) OAuth via Google.

### 4.2 Party Management (Host)
- Create / edit / delete a party.
- Party fields: title, date, start time, end time (optional), location (address or free text), description/notes, theme (optional), RSVP deadline (optional), cover image (optional).
- No per-party capacity limit / max headcount in v1 — Hosts cannot cap or auto-close RSVPs once a threshold is reached.
- Party status: Draft, Published, Cancelled, Past (auto-computed from date).
- Duplicate a past party as a starting template for a new one (nice-to-have).

### 4.3 Invitee Management (Host)
- Add invitee: name, guardian email, optional note (e.g., "from school").
- Bulk add via CSV upload or paste (name, email columns).
- Edit/remove an invitee before or after sending.
- Track invite status per invitee: Not Sent, Sent, Opened (if trackable), Responded.
- Resend invite to an individual or to all "Not Responded" invitees.
- Each invitee gets exactly one unique, personalized invite token/link. Non-personalized or shareable links (e.g., a generic link usable by anyone, such as extended family) are out of scope for v1.

### 4.4 Email Notifications
**Outbound to Guests:**
- Initial invitation email (party details + RSVP link).
- Reminder email (manual trigger by Host, or automatic X days before RSVP deadline/event — configurable).
- Confirmation email to Guest after they submit/update their RSVP.

**Outbound to Host:**
- Notification email each time a Guest responds or changes their response, including: invitee name, response (attending/not), sibling names if any, message, and updated running headcount for the party.
- Optional daily digest mode instead of per-response emails (nice-to-have setting).

### 4.5 RSVP Flow (Guest)
- View party details.
- Respond Attending / Not Attending.
- If attending: add any number of additional attendees (name + relationship, e.g., "sibling," "parent") — no hard cap.
- Optional message field (e.g., allergies, arrival time note).
- Ability to update response any time before the RSVP deadline (or event date if no deadline is set), including switching between Attending and Not Attending in either direction. Responses lock once the deadline/event date passes.
- View a list of other invitees who have RSVP'd Attending (plus their additional attendees), so parents can see who else is coming. Pending and declined invitees, and other guests' messages, are kept private.
- Confirmation screen + email after submission.

### 4.6 Host Dashboard
- List of all parties (upcoming / past).
- Per-party view: invitee list with statuses, total invited, total responded, total attending headcount (including siblings), total declined.
- View individual guest messages.
- Filter/sort (e.g., show only "Pending").
- Export guest list + responses to CSV.

### 4.7 Notifications/Settings (Host)
- Toggle: instant email per response vs. daily digest.
- Toggle: send automatic reminder emails N days before RSVP deadline.

---

## 5. Data Model (Draft)

### 5.1 User
- id
- name
- email (unique)
- password_hash (nullable if passwordless-only)
- email_verified (bool)
- created_at

### 5.2 Party
- id
- host_user_id (FK → User)
- title
- description
- location
- start_datetime
- end_datetime (nullable)
- rsvp_deadline (nullable)
- status (draft / published / cancelled)
- cover_image_url (nullable)
- max_headcount (nullable)
- created_at / updated_at

### 5.3 Invitee
- id
- party_id (FK → Party)
- name (child's name)
- guardian_email
- invite_token (unique, for tokenized RSVP link — one per invitee, never shared/reused; this token is the sole authentication mechanism for Guests in v1)
- invite_status (not_sent / sent / responded)
- created_at

Note: the RSVP page for a given invitee should query all "attending" RSVP Responses (and their Additional Attendees) for the same party_id to render the "who else is coming" list described in §4.5.

### 5.4 RSVP Response
- id
- invitee_id (FK → Invitee)
- responded_by_user_id (FK → User, nullable if responded via token without account)
- status (attending / not_attending)
- message (text, optional)
- submitted_at
- updated_at

### 5.5 Additional Attendee (Siblings)
- id
- rsvp_response_id (FK → RSVP Response)
- name
- relationship (optional, e.g., "sibling")

### 5.6 Notification Log (optional, for auditing/debugging)
- id
- type (invite_sent / reminder_sent / rsvp_confirmation / host_notification)
- recipient_email
- related_party_id / related_invitee_id
- sent_at
- status (sent / failed)

---

## 6. Email Content Requirements

| Email | Trigger | Key content |
|---|---|---|
| Invitation | Host sends invites | Party title, date/time, location, host name, "Respond" CTA button linking to tokenized RSVP page |
| RSVP confirmation (to Guest) | Guest submits/updates response | Confirmation of their response, party details recap, "edit your response" link |
| Response notification (to Host) | Any Guest submits/updates response | Invitee name, response, sibling names, message, running totals |
| Reminder | Manual or automatic (X days before deadline) | Same as invitation, marked "Reminder," shows current response status if already responded |

All emails should be sent via a transactional email service (see §8).

---

## 7. Non-Functional Requirements
- **Privacy:** Guest emails and RSVP data are only visible to the Host of that specific party — not shared across hosts or publicly.
- **Security:** Invite tokens must be unguessable (cryptographically random) and single-purpose per invitee/party.
- **Reliability:** Email delivery should be retried on failure; failures should be visible to the Host (e.g., "invite bounced").
- **Responsiveness:** Mobile-friendly, since many Guests will open the invite/RSVP link on a phone from their email app.
- **Scalability:** Should comfortably support hosts with up to a few hundred invitees per party (typical use case is 10–50, but don't hard-code small limits).

---

## 8. Suggested Technical Approach (non-binding, for implementer's discretion)
- **Frontend:** Any modern SPA framework (React/Vue) or server-rendered app; must be mobile-responsive.
- **Backend:** REST or GraphQL API backing the data model in §5.
- **Auth:** Session or JWT-based; support magic-link tokens for passwordless flows.
- **Email delivery:** Transactional email provider (e.g., SendGrid, Postmark, AWS SES, Resend) — needed for deliverability, bounce handling, and templating.
- **Database:** Any relational database (PostgreSQL recommended) given the relational structure in §5.

---

## 9. Decisions (Resolved)
1. **Guest accounts:** Not required. Magic-link/token-only RSVP is sufficient for v1; account creation is optional and not gated.
2. **Additional attendees (siblings) cap:** No hard cap — an invitee can list any number of additional attendees.
3. **Per-party capacity limit:** Not supported in v1 — Hosts cannot cap total headcount or auto-close RSVPs.
4. **Non-personalized/shareable links:** Out of scope for v1. Strictly one token per invitee.
5. **Changing response after decline:** Allowed — a Guest can switch from "Not Attending" back to "Attending" (or vice versa) any time before the RSVP deadline (or event date if no deadline is set). Locked after that.
6. **Invitee visibility:** Invitees can see the names of other invitees who have RSVP'd "Attending" (and their additional attendees) on the RSVP page, so parents can see who else is going. Pending/declined status and other guests' messages remain private to the Host.

---

## 10. Success Metrics (suggested)
- % of invitees who respond (target: >80% within a week of sending).
- Time from invite sent to first response.
- Host satisfaction with reduced manual coordination effort (qualitative).

---

## 11. MVP Scope Recap
**Must-have for v1:**
- Host signup/login, create party, add invitees, send invites.
- Guest RSVP flow via emailed link (attend/not, siblings, message).
- Host email notification per response.
- Host dashboard showing all responses per party.

**Nice-to-have / fast-follow:**
- CSV export, reminders, daily digest mode, OAuth login, calendar sync, party templates.
