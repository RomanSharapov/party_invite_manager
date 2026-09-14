import test from "node:test";
import assert from "node:assert/strict";
import {
  confirmedNames,
  parseInviteCsv,
  partySchema,
  responseLocked,
  rsvpSchema,
  totals,
} from "../lib/domain";
import { escapeHtml, template } from "../lib/email";
import { wallTimeToIso } from "../lib/time";
test("responses lock exactly at deadline or event start, and cancelled/draft parties stay locked", () => {
  const p = {
    status: "PUBLISHED",
    startDateTime: "2030-06-15T18:00:00Z",
    rsvpDeadline: null,
  };
  assert.equal(responseLocked(p, new Date("2030-06-15T17:59:59Z")), false);
  assert.equal(responseLocked(p, new Date(p.startDateTime)), true);
  assert.equal(
    responseLocked(
      { ...p, rsvpDeadline: "2030-06-10T18:00:00Z" },
      new Date("2030-06-10T18:00:00Z"),
    ),
    true,
  );
  for (const status of ["CANCELLED", "DRAFT"])
    assert.equal(
      responseLocked({ ...p, status }, new Date("2030-01-01")),
      true,
    );
});
test("no sibling cap and declining clears all additional attendees", () => {
  const additionalAttendees = Array.from({ length: 501 }, (_, i) => ({
    name: `Guest ${i}`,
    relationship: "sibling",
  }));
  assert.equal(
    rsvpSchema.parse({ status: "ATTENDING", additionalAttendees })
      .additionalAttendees.length,
    501,
  );
  assert.deepEqual(
    rsvpSchema.parse({ status: "NOT_ATTENDING", additionalAttendees })
      .additionalAttendees,
    [],
  );
  assert.equal(rsvpSchema.safeParse({ status: "PENDING" }).success, false);
});
test("confirmed roster projects names only and excludes self, pending, declined, email and messages", () => {
  const people = [
    {
      id: "self",
      name: "Self",
      response: { status: "ATTENDING", additionalAttendees: [] },
    },
    {
      id: "yes",
      name: "Yes",
      guardianEmail: "private@example.com",
      response: {
        status: "ATTENDING",
        message: "allergy",
        additionalAttendees: [{ name: "Sibling", relationship: "private" }],
      },
    },
    {
      id: "no",
      name: "No",
      response: { status: "NOT_ATTENDING", additionalAttendees: [] },
    },
    { id: "pending", name: "Pending", response: null },
  ];
  assert.deepEqual(confirmedNames(people, "self"), [
    { name: "Yes", additionalAttendees: [{ name: "Sibling" }] },
  ]);
  assert.deepEqual(totals(people), {
    invited: 4,
    responded: 3,
    attending: 3,
    declined: 1,
  });
});
test("CSV supports BOM, quoted commas, shared guardian emails and rejects invalid rows", () => {
  assert.deepEqual(
    parseInviteCsv(
      '\ufeffname,email\n"Doe, Sam",PARENT@example.com\nElla,parent@example.com',
    ),
    [
      {
        name: "Doe, Sam",
        guardianEmail: "parent@example.com",
        note: undefined,
      },
      { name: "Ella", guardianEmail: "parent@example.com", note: undefined },
    ],
  );
  assert.throws(() => parseInviteCsv("name,email\nSam,invalid"), /row 2/);
  assert.throws(() => parseInviteCsv("name,email\n"), /no invitees/);
  assert.throws(
    () => parseInviteCsv('name,email\n"Sam,parent@example.com'),
    /Invalid CSV/,
  );
});
test("email HTML escapes guest-controlled text", () => {
  assert.equal(escapeHtml('<script>"&'), "&lt;script&gt;&quot;&amp;");
  assert.ok(
    !template("<script>", ["<img src=x onerror=alert(1)>"]).html.includes(
      "<script>",
    ),
  );
});
test("dates honor event timezone and reject impossible DST wall times", () => {
  assert.equal(
    wallTimeToIso("2030-07-01T14:00", "America/New_York"),
    "2030-07-01T18:00:00.000Z",
  );
  assert.equal(
    wallTimeToIso("2030-01-01T14:00", "America/New_York"),
    "2030-01-01T19:00:00.000Z",
  );
  assert.throws(
    () => wallTimeToIso("2030-03-10T02:30", "America/New_York"),
    /daylight saving/,
  );
});
test("party model rejects reversed timing and does not accept capacity", () => {
  const p = {
    title: "Birthday",
    location: "Garden",
    startDateTime: "2030-01-02T12:00:00Z",
    timeZone: "UTC",
    status: "PUBLISHED",
    maxHeadcount: 1,
  };
  assert.equal("maxHeadcount" in partySchema.parse(p), false);
  assert.equal(
    partySchema.safeParse({ ...p, endDateTime: "2030-01-01T12:00:00Z" })
      .success,
    false,
  );
  assert.equal(
    partySchema.safeParse({ ...p, rsvpDeadline: "2030-01-03T12:00:00Z" })
      .success,
    false,
  );
});
