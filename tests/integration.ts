import test from "node:test";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { deliver } from "../lib/email";
if (process.env.EMAIL_MODE !== "preview")
  throw new Error("Integration tests require EMAIL_MODE=preview");
const db = new PrismaClient();
const base = process.env.TEST_APP_URL || "http://localhost:3000";
const stamp = Date.now();
let cookie = "",
  otherCookie = "",
  partyId = "",
  hostId = "",
  otherId = "";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  session = cookie,
  headers: Record<string, string> = {},
) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: session,
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = res.status === 204 ? null : await res.json();
  return {
    status: res.status,
    data,
    cookie: res.headers.get("set-cookie")?.split(";")[0] ?? "",
  };
}
async function getToken(email: string, type: string) {
  const log = await db.notificationLog.findFirstOrThrow({
    where: { recipientEmail: email, type: "AUTH" },
    orderBy: { createdAt: "desc" },
  });
  const url = log.text.match(/http[^\s]+\/auth\/confirm\?[^\s]+/)?.[0];
  assert.ok(url);
  const token = new URL(url).searchParams.get("token");
  assert.ok(token);
  assert.ok(url.includes(type));
  return token;
}
test("full REST flows, host isolation, guest privacy, auth and deadlines", async (t) => {
  try {
    const email = `test-${stamp}@example.com`,
      pass = "IntegrationPassword123!";
    await t.test(
      "signup requires verification, consumes token once, rejects cross-origin",
      async () => {
        assert.equal(
          (
            await request(
              "/api/auth/signup",
              "POST",
              { name: "Test Host", email, password: pass },
              "",
              { Origin: "https://evil.example" },
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await request(
              "/api/auth/signup",
              "POST",
              { name: "Test Host", email, password: pass },
              "",
            )
          ).status,
          202,
        );
        hostId = (await db.user.findUniqueOrThrow({ where: { email } })).id;
        assert.equal(
          (
            await request(
              "/api/auth/login",
              "POST",
              { email, password: pass },
              "",
            )
          ).status,
          403,
        );
        const token = await getToken(email, "VERIFY_EMAIL");
        const confirmed = await request(
          "/api/auth/consume",
          "POST",
          { token },
          "",
        );
        assert.equal(confirmed.status, 200);
        cookie = confirmed.cookie;
        assert.ok(cookie);
        assert.equal(
          (await request("/api/auth/consume", "POST", { token }, "")).status,
          400,
        );
      },
    );
    await t.test("password login and magic-link signup", async () => {
      assert.equal(
        (
          await request(
            "/api/auth/login",
            "POST",
            { email, password: "wrong" },
            "",
          )
        ).status,
        401,
      );
      const login = await request(
        "/api/auth/login",
        "POST",
        { email, password: pass },
        "",
      );
      assert.equal(login.status, 200);
      cookie = login.cookie;
      const otherEmail = `test-other-${stamp}@example.com`;
      assert.equal(
        (
          await request(
            "/api/auth/magic-link",
            "POST",
            { email: otherEmail },
            "",
          )
        ).status,
        202,
      );
      otherId = (
        await db.user.findUniqueOrThrow({ where: { email: otherEmail } })
      ).id;
      const token = await getToken(otherEmail, "MAGIC_LINK");
      const result = await request("/api/auth/consume", "POST", { token }, "");
      assert.equal(result.status, 200);
      otherCookie = result.cookie;
    });
    await t.test("party CRUD and ownership", async () => {
      const party = {
        title: "Integration birthday",
        location: "Test garden",
        timeZone: "America/New_York",
        startDateTime: new Date(Date.now() + 7 * 86400000).toISOString(),
        status: "PUBLISHED",
      };
      assert.equal(
        (await request("/api/parties", "POST", party, "")).status,
        401,
      );
      const created = await request("/api/parties", "POST", party);
      assert.equal(created.status, 201);
      partyId = created.data.id;
      assert.equal(
        (
          await request(
            `/api/parties/${partyId}`,
            "GET",
            undefined,
            otherCookie,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(
            `/api/parties/${partyId}`,
            "PATCH",
            { title: "Stolen" },
            otherCookie,
          )
        ).status,
        404,
      );
      assert.equal(
        (
          await request(`/api/parties/${partyId}`, "PATCH", {
            description: "Updated",
          })
        ).status,
        200,
      );
    });
    let yes: any, no: any, pending: any;
    await t.test(
      "atomic CSV import, shared guardian email and stable unique tokens",
      async () => {
        const prefix = `/api/parties/${partyId}/invitees`;
        assert.equal(
          (
            await request(prefix, "POST", {
              csv: "name,email\nValid,valid@example.com\nInvalid,no",
            })
          ).status,
          400,
        );
        assert.equal((await request(prefix)).data.length, 0);
        const imported = await request(prefix, "POST", {
          csv: 'name,email\n"Attending, Child",family@example.com\nDeclined Child,family@example.com\nPending Child,pending@example.com',
        });
        assert.equal(imported.status, 201);
        [yes, no, pending] = imported.data;
        assert.equal(
          new Set(imported.data.map((i: any) => i.inviteToken)).size,
          3,
        );
        assert.match(yes.inviteToken, /^[a-f0-9]{64}$/);
        const edited = await request(`${prefix}/${yes.id}`, "PATCH", {
          note: "Host-only note",
        });
        assert.equal(edited.data.inviteToken, yes.inviteToken);
        assert.equal(
          (await request(prefix, "GET", undefined, otherCookie)).status,
          404,
        );
      },
    );
    await t.test(
      "invitation and reminder templates are queued without real email",
      async () => {
        assert.equal(
          (
            await request(`/api/parties/${partyId}/invitations`, "POST", {
              scope: "unsent",
            })
          ).data.queued,
          3,
        );
        assert.equal(
          (
            await request(`/api/parties/${partyId}/invitations`, "POST", {
              scope: "individual",
              inviteeId: no.id,
              reminder: true,
            })
          ).data.queued,
          1,
        );
        const logs = await db.notificationLog.findMany({
          where: { relatedPartyId: partyId },
        });
        assert.ok(
          logs.some(
            (l) => l.type === "INVITATION" && l.text.includes(yes.inviteToken),
          ),
        );
        assert.ok(
          logs.some(
            (l) =>
              l.type === "REMINDER" &&
              l.text.includes("Current response: pending"),
          ),
        );
      },
    );
    await t.test(
      "guest RSVP needs no session, permits hundreds of additional attendees, and shows names only",
      async () => {
        const extras = Array.from({ length: 120 }, (_, i) => ({
          name: `Sibling ${i}`,
          relationship: "sibling",
        }));
        assert.equal(
          (
            await request(
              `/api/rsvp/${yes.inviteToken}`,
              "PUT",
              {
                status: "ATTENDING",
                message: "Private allergy message",
                additionalAttendees: extras,
              },
              "",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              `/api/rsvp/${no.inviteToken}`,
              "PUT",
              { status: "NOT_ATTENDING", message: "Private decline" },
              "",
            )
          ).status,
          200,
        );
        const guest = await request(
          `/api/rsvp/${pending.inviteToken}`,
          "GET",
          undefined,
          "",
        );
        assert.equal(guest.status, 200);
        const raw = JSON.stringify(guest.data);
        for (const secret of [
          "family@example.com",
          "Private allergy",
          "Private decline",
          "Declined Child",
          "Host-only note",
          yes.inviteToken,
        ])
          assert.equal(raw.includes(secret), false, secret);
        assert.equal(guest.data.confirmedAttendees.length, 1);
        assert.equal(
          guest.data.confirmedAttendees[0].additionalAttendees.length,
          120,
        );
        assert.deepEqual(Object.keys(guest.data.confirmedAttendees[0]).sort(), [
          "additionalAttendees",
          "name",
        ]);
        const dashboard = await request(`/api/parties/${partyId}`);
        assert.deepEqual(dashboard.data.totals, {
          invited: 3,
          responded: 2,
          attending: 121,
          declined: 1,
        });
        const logs = await db.notificationLog.findMany({
          where: { relatedPartyId: partyId, type: "HOST_NOTIFICATION" },
        });
        assert.ok(
          logs.some(
            (l) =>
              l.text.includes("Private allergy message") &&
              l.text.includes("121 attending"),
          ),
        );
      },
    );
    await t.test(
      "attending ↔ declined transitions replace attendees and preserve one response",
      async () => {
        assert.equal(
          (
            await request(
              `/api/rsvp/${yes.inviteToken}`,
              "PUT",
              {
                status: "NOT_ATTENDING",
                additionalAttendees: [{ name: "Ignored" }],
              },
              "",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              `/api/rsvp/${no.inviteToken}`,
              "PUT",
              {
                status: "ATTENDING",
                additionalAttendees: [{ name: "New sibling" }],
              },
              "",
            )
          ).status,
          200,
        );
        assert.equal(
          (
            await request(
              `/api/rsvp/${yes.inviteToken}`,
              "PUT",
              { status: "ATTENDING", additionalAttendees: [] },
              "",
            )
          ).status,
          200,
        );
        const dashboard = await request(`/api/parties/${partyId}`);
        assert.equal(dashboard.data.totals.attending, 3);
        assert.equal(
          await db.rsvpResponse.count({ where: { inviteeId: yes.id } }),
          1,
        );
        assert.equal(
          await db.additionalAttendee.count({
            where: { response: { inviteeId: yes.id } },
          }),
          0,
        );
      },
    );
    await t.test(
      "concurrent response edits remain consistent and queue each committed response",
      async () => {
        const before = await db.notificationLog.count({
          where: { relatedPartyId: partyId, type: "HOST_NOTIFICATION" },
        });
        const results = await Promise.all([
          request(
            `/api/rsvp/${yes.inviteToken}`,
            "PUT",
            { status: "NOT_ATTENDING" },
            "",
          ),
          request(
            `/api/rsvp/${yes.inviteToken}`,
            "PUT",
            { status: "ATTENDING", additionalAttendees: [{ name: "Sibling" }] },
            "",
          ),
        ]);
        assert.ok(results.every((r) => r.status === 200));
        assert.equal(
          await db.rsvpResponse.count({ where: { inviteeId: yes.id } }),
          1,
        );
        assert.equal(
          await db.notificationLog.count({
            where: { relatedPartyId: partyId, type: "HOST_NOTIFICATION" },
          }),
          before + 2,
        );
      },
    );
    await t.test(
      "server enforces explicit deadline, event-date fallback, draft/cancelled and invalid tokens",
      async () => {
        await request(`/api/parties/${partyId}`, "PATCH", {
          rsvpDeadline: new Date(Date.now() - 1000).toISOString(),
        });
        assert.equal(
          (
            await request(
              `/api/rsvp/${no.inviteToken}`,
              "PUT",
              { status: "NOT_ATTENDING" },
              "",
            )
          ).status,
          409,
        );
        await request(`/api/parties/${partyId}`, "PATCH", {
          rsvpDeadline: null,
          startDateTime: new Date(Date.now() - 1000).toISOString(),
        });
        assert.equal(
          (
            await request(
              `/api/rsvp/${yes.inviteToken}`,
              "PUT",
              { status: "NOT_ATTENDING" },
              "",
            )
          ).status,
          409,
        );
        await request(`/api/parties/${partyId}`, "PATCH", { status: "DRAFT" });
        assert.equal(
          (await request(`/api/rsvp/${yes.inviteToken}`, "GET", undefined, ""))
            .status,
          404,
        );
        await request(`/api/parties/${partyId}`, "PATCH", {
          status: "CANCELLED",
        });
        assert.equal(
          (
            await request(
              `/api/rsvp/${yes.inviteToken}`,
              "PUT",
              { status: "ATTENDING" },
              "",
            )
          ).status,
          409,
        );
        assert.equal(
          (await request("/api/rsvp/not-a-token", "GET", undefined, "")).status,
          404,
        );
      },
    );
    await t.test("password reset invalidates existing sessions", async () => {
      await request("/api/auth/forgot-password", "POST", { email }, "");
      const token = await getToken(email, "RESET_PASSWORD");
      const old = cookie;
      const result = await request(
        "/api/auth/consume",
        "POST",
        { token, password: "NewPassword123!" },
        "",
      );
      assert.equal(result.status, 200);
      cookie = result.cookie;
      assert.equal(
        (await request("/api/parties", "GET", undefined, old)).status,
        401,
      );
      assert.equal(
        (
          await request(
            "/api/auth/login",
            "POST",
            { email, password: pass },
            "",
          )
        ).status,
        401,
      );
    });
    await t.test(
      "provider failures persist with retry backoff and remain visible to the host",
      async () => {
        const log = await db.notificationLog.create({
          data: {
            type: "INVITATION",
            recipientEmail: "failure@example.com",
            relatedPartyId: partyId,
            subject: "Failure test",
            html: "<p>Test</p>",
            text: "Test",
          },
        });
        const oldMode = process.env.EMAIL_MODE,
          oldKey = process.env.RESEND_API_KEY;
        try {
          process.env.EMAIL_MODE = "resend";
          delete process.env.RESEND_API_KEY;
          await deliver(log.id);
        } finally {
          process.env.EMAIL_MODE = oldMode;
          if (oldKey) process.env.RESEND_API_KEY = oldKey;
        }
        const failed = await db.notificationLog.findUniqueOrThrow({
          where: { id: log.id },
        });
        assert.equal(failed.status, "FAILED");
        assert.equal(failed.attempts, 1);
        assert.ok(failed.nextAttemptAt > new Date());
        assert.equal(failed.lastError, "Email provider is not configured");
        await deliver(log.id);
        assert.equal(
          (
            await db.notificationLog.findUniqueOrThrow({
              where: { id: log.id },
            })
          ).attempts,
          1,
        );
        assert.ok(
          (await request(`/api/parties/${partyId}/emails`)).data.some(
            (l: any) => l.id === log.id && l.status === "FAILED",
          ),
        );
      },
    );
    await t.test(
      "deleting invitee revokes link; deleting party cascades",
      async () => {
        assert.equal(
          (
            await request(
              `/api/parties/${partyId}/invitees/${pending.id}`,
              "DELETE",
              {},
            )
          ).status,
          204,
        );
        assert.equal(
          (
            await request(
              `/api/rsvp/${pending.inviteToken}`,
              "GET",
              undefined,
              "",
            )
          ).status,
          404,
        );
        assert.equal(
          (await request(`/api/parties/${partyId}`, "DELETE", {})).status,
          204,
        );
        assert.equal(await db.invitee.count({ where: { partyId } }), 0);
      },
    );
  } finally {
    if (hostId) await db.user.deleteMany({ where: { id: hostId } });
    if (otherId) await db.user.deleteMany({ where: { id: otherId } });
    await db.notificationLog.deleteMany({
      where: {
        recipientEmail: {
          in: [`test-${stamp}@example.com`, `test-other-${stamp}@example.com`],
        },
      },
    });
    await db.$disconnect();
  }
});
