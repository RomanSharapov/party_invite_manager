import test from "node:test";
import assert from "node:assert/strict";
import { inviteeSchema, rsvpSchema, inviteContact } from "../lib/domain";
import { responseEmails, invitationEmail } from "../lib/email";
import { calendarFile } from "../lib/calendar";
import { shareMessage, smsHref } from "../lib/invitation-copy";

const party = {
  id: "party-id",
  title: "Birthday 🎂",
  description: "Bring joy",
  location: "Garden, Main St",
  startDateTime: new Date("2030-07-01T18:00:00Z"),
  endDateTime: null,
  rsvpDeadline: null,
  timeZone: "America/New_York",
  status: "PUBLISHED",
  host: { name: "Host", email: "host@example.com" },
};
const invitee = {
  id: "child",
  name: "Child",
  guardianEmail: null,
  inviteToken: "token",
};
test("delivery contact rules validate creation and merged edits", () => {
  for (const guardianEmail of [undefined, null, "", "   "])
    assert.equal(
      inviteeSchema.safeParse({ name: "Child", guardianEmail }).success,
      false,
    );
  for (const contact of [
    { phone: " +1 (555) 123-4567 " },
    { guardianEmail: " PARENT@example.com " },
  ])
    assert.equal(
      inviteeSchema.parse({
        name: "Child",
        deliveryMethod: "manual_link",
        ...contact,
      }).deliveryMethod,
      "manual_link",
    );
  for (const contact of [
    {},
    { phone: " " },
    { guardianEmail: "invalid", phone: "123" },
  ])
    assert.equal(
      inviteeSchema.safeParse({
        name: "Child",
        deliveryMethod: "manual_link",
        ...contact,
      }).success,
      false,
    );
  assert.equal(
    inviteeSchema.parse({ name: "Child", guardianEmail: "PARENT@example.com" })
      .guardianEmail,
    "parent@example.com",
  );
  assert.equal(
    inviteeSchema.safeParse({
      name: "Child",
      deliveryMethod: "sms",
      phone: "123",
    }).success,
    false,
  );
});
test("optional RSVP email rejects injection and normalizes valid addresses", () => {
  for (const guardianEmail of [
    "bad",
    "<script>@evil",
    "a@example.com\r\nBcc: b@example.com",
  ])
    assert.equal(
      rsvpSchema.safeParse({ status: "ATTENDING", guardianEmail }).success,
      false,
    );
  assert.equal(
    rsvpSchema.parse({ status: "ATTENDING", guardianEmail: " " }).guardianEmail,
    null,
  );
  assert.equal(
    rsvpSchema.parse({ status: "ATTENDING", guardianEmail: " A@example.com " })
      .guardianEmail,
    "a@example.com",
  );
});
test("host is always notified and guests only receive confirmation with an email", () => {
  const response = { status: "ATTENDING", additionalAttendees: [] };
  const count = { invited: 1, responded: 1, attending: 1, declined: 0 };
  assert.deepEqual(
    responseEmails(party, invitee, response, count).map((e) => e.type),
    ["HOST_NOTIFICATION"],
  );
  const messages = responseEmails(
    party,
    { ...invitee, guardianEmail: "guest@example.com" },
    response,
    count,
  );
  assert.deepEqual(
    messages.map((e) => e.recipientEmail),
    ["guest@example.com", "host@example.com"],
  );
});
test("sharing reuses email invitation copy and encodes SMS parameters", () => {
  const url = "https://example.com/rsvp/token";
  const message = shareMessage(party.title, invitee.name, party.host.name, url);
  const email = invitationEmail(party, {
    ...invitee,
    guardianEmail: "a@example.com",
  });
  assert.ok(message.includes(email.subject));
  assert.ok(
    email.text.includes("Hi Child! Host would love to celebrate with you."),
  );
  assert.equal(
    smsHref("+1 (555) 123", message),
    `sms:%2B1555123?body=${encodeURIComponent(message)}`,
  );
  assert.equal(
    smsHref("123?body=evil&", message, true),
    `sms:123&body=${encodeURIComponent(message)}`,
  );
});
test("calendar uses UTC instants, escapes injection, folds UTF-8 and keeps a stable UID", () => {
  const calendar = calendarFile({
    ...party,
    title: "🎂".repeat(100),
    location: "A;B,C\\D\nEND:VEVENT",
    endDateTime: new Date("2030-07-01T20:00:00Z"),
  });
  assert.ok(
    calendar.includes("DTSTART:20300701T180000Z\r\nDTEND:20300701T200000Z"),
  );
  assert.ok(calendar.includes("LOCATION:A\\;B\\,C\\\\D\\nEND:VEVENT"));
  assert.equal(
    calendar.split("\r\n").filter((l) => l === "END:VEVENT").length,
    1,
  );
  assert.ok(calendar.split("\r\n").every((l) => Buffer.byteLength(l) <= 75));
  assert.ok(
    calendar.replace(/\r\n /g, "").includes(`SUMMARY:${"🎂".repeat(100)}`),
  );
  assert.ok(calendarFile(party).includes("UID:party-id@party-invite"));
  assert.ok(!calendarFile(party).includes("DTEND"));
});

test("combined contact distinguishes email and phone and rejects invalid values", () => {
  assert.deepEqual(inviteContact(" Parent@Example.com "), {
    deliveryMethod: "email",
    guardianEmail: "parent@example.com",
    phone: null,
  });
  assert.deepEqual(inviteContact(" +1 (555) 123-4567 "), {
    deliveryMethod: "manual_link",
    guardianEmail: null,
    phone: "+1 (555) 123-4567",
  });
  for (const value of [
    "",
    "invalid",
    "123",
    "bad@email",
    "5551234567?body=bad",
  ])
    assert.throws(() => inviteContact(value));
});
