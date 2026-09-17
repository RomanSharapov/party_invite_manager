import { Resend } from "resend";
import { db } from "./db";
import { appUrl } from "./http";
import { invitationSubject, invitationGreeting } from "./invitation-copy";
import { partyDate } from "./domain";
import type { EmailType, Prisma } from "@prisma/client";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function template(
  subject: string,
  lines: string[],
  cta?: { label: string; url: string },
) {
  return {
    subject,
    text: [subject, ...lines, cta ? `${cta.label}: ${cta.url}` : ""].join(
      "\n\n",
    ),
    html: `<!doctype html><html><body style="background:#f8f5ef;font-family:Arial,sans-serif;color:#253e35;padding:24px"><main style="max-width:560px;margin:auto;background:white;padding:32px;border-radius:18px"><p style="color:#577567">PARTY INVITE MANAGER</p><h1>${escapeHtml(subject)}</h1>${lines.map((l) => `<p style="line-height:1.6;white-space:pre-wrap">${escapeHtml(l)}</p>`).join("")}${cta ? `<p><a style="display:inline-block;padding:14px 22px;background:#244f40;color:white;border-radius:8px" href="${escapeHtml(cta.url)}">${escapeHtml(cta.label)}</a></p>` : ""}</main></body></html>`,
  };
}
type PartyInfo = {
  id: string;
  title: string;
  startDateTime: Date;
  endDateTime: Date | null;
  rsvpDeadline: Date | null;
  timeZone: string;
  location: string;
  host: { name: string; email: string };
};
export function invitationEmail(
  p: PartyInfo,
  i: {
    id: string;
    name: string;
    guardianEmail: string | null;
    inviteToken: string;
    response?: { status: string } | null;
  },
  reminder = false,
) {
  if (!i.guardianEmail)
    throw new Error("Invitation email requires an email address");
  return {
    type: (reminder ? "REMINDER" : "INVITATION") as EmailType,
    recipientEmail: i.guardianEmail,
    relatedPartyId: p.id,
    relatedInviteeId: i.id,
    ...template(
      reminder ? `Reminder: ${p.title}` : invitationSubject(p.title),
      [
        invitationGreeting(i.name, p.host.name),
        partyDate(p),
        `Where: ${p.location}`,
        p.rsvpDeadline
          ? `Please respond by ${partyDate({ ...p, startDateTime: p.rsvpDeadline })}`
          : "Please respond before the party starts.",
        ...(reminder
          ? [
              `Current response: ${i.response?.status.replaceAll("_", " ").toLowerCase() ?? "pending"}`,
            ]
          : []),
      ],
      {
        label: "Respond to invitation",
        url: `${appUrl()}/rsvp/${i.inviteToken}`,
      },
    ),
  };
}
export function responseEmails(
  p: PartyInfo,
  i: {
    id: string;
    name: string;
    guardianEmail: string | null;
    inviteToken: string;
  },
  r: {
    status: string;
    message?: string | null;
    additionalAttendees: { name: string; relationship?: string | null }[];
  },
  count: {
    invited: number;
    responded: number;
    attending: number;
    declined: number;
  },
) {
  const answer = r.status === "ATTENDING" ? "Attending" : "Not attending";
  const extras =
    r.additionalAttendees
      .map((a) => `${a.name}${a.relationship ? ` (${a.relationship})` : ""}`)
      .join(", ") || "None";
  return [
    ...(i.guardianEmail
      ? [
          {
            type: "RSVP_CONFIRMATION" as EmailType,
            recipientEmail: i.guardianEmail,
            relatedPartyId: p.id,
            relatedInviteeId: i.id,
            ...template(
              `RSVP confirmed: ${p.title}`,
              [
                `${i.name}: ${answer}`,
                `Additional attendees: ${extras}`,
                partyDate(p),
                `Where: ${p.location}`,
                "You can change your response until the RSVP deadline, or the party start if no deadline is set.",
              ],
              {
                label: "Edit your response",
                url: `${appUrl()}/rsvp/${i.inviteToken}`,
              },
            ),
          },
        ]
      : []),
    {
      type: "HOST_NOTIFICATION" as EmailType,
      recipientEmail: p.host.email,
      relatedPartyId: p.id,
      relatedInviteeId: i.id,
      ...template(
        `${i.name} responded: ${answer}`,
        [
          `Party: ${p.title}`,
          `Additional attendees: ${extras}`,
          `Message: ${r.message || "No message"}`,
          `Running totals: ${count.attending} attending (including additional attendees), ${count.responded}/${count.invited} responded, ${count.declined} declined.`,
        ],
        { label: "View party dashboard", url: `${appUrl()}/parties/${p.id}` },
      ),
    },
  ];
}
export async function enqueue(data: Prisma.NotificationLogCreateManyInput) {
  return db.notificationLog.create({ data });
}
export async function deliver(id: string) {
  const now = new Date();
  const claimed = await db.notificationLog.updateMany({
    where: {
      id,
      OR: [
        {
          status: { in: ["PENDING", "FAILED"] },
          nextAttemptAt: { lte: now },
          attempts: { lt: 5 },
        },
        { status: "SENDING", nextAttemptAt: { lte: now }, attempts: { lt: 5 } },
      ],
    },
    data: {
      status: "SENDING",
      attempts: { increment: 1 },
      nextAttemptAt: new Date(Date.now() + 120000),
    },
  });
  if (!claimed.count) return;
  const log = await db.notificationLog.findUniqueOrThrow({ where: { id } });
  try {
    if (
      process.env.EMAIL_MODE === "preview" &&
      process.env.NODE_ENV !== "production"
    ) {
      await db.notificationLog.update({
        where: { id },
        data: { status: "PREVIEW", lastError: null },
      });
      return;
    }
    if (!process.env.RESEND_API_KEY)
      throw new Error("Email provider is not configured");
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from: process.env.EMAIL_FROM!,
        to: log.recipientEmail,
        subject: log.subject,
        html: log.html,
        text: log.text,
      },
      { idempotencyKey: log.id },
    );
    if (result.error) throw new Error(result.error.message);
    await db.$transaction(async (tx) => {
      await tx.notificationLog.update({
        where: { id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          providerId: result.data?.id,
          lastError: null,
        },
      });
      if (
        log.relatedInviteeId &&
        (log.type === "INVITATION" || log.type === "REMINDER")
      ) {
        await tx.invitee.updateMany({
          where: {
            id: log.relatedInviteeId,
            inviteStatus: "NOT_SENT",
            deliveryMethod: "email",
          },
          data: { inviteStatus: "SENT", sentAt: new Date() },
        });
      }
    });
  } catch (e) {
    await db.notificationLog.update({
      where: { id },
      data: {
        status: "FAILED",
        lastError: e instanceof Error ? e.message : "Delivery failed",
        nextAttemptAt: new Date(
          Date.now() + Math.min(3600000, 30000 * 2 ** log.attempts),
        ),
      },
    });
  }
}
export async function flushEmails(ids?: string[]) {
  await db.notificationLog.updateMany({
    where: {
      status: "SENDING",
      nextAttemptAt: { lte: new Date() },
      attempts: { gte: 5 },
    },
    data: {
      status: "FAILED",
      lastError:
        "Delivery worker interrupted after the final attempt. Please review and retry.",
    },
  });
  const logs = await db.notificationLog.findMany({
    where: {
      ...(ids ? { id: { in: ids } } : {}),
      status: { in: ["PENDING", "FAILED", "SENDING"] },
      attempts: { lt: 5 },
      nextAttemptAt: { lte: new Date() },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  // Small batches respect provider limits; the durable queue retains the rest.
  let processed = 0;
  const stopAt = Date.now() + 45000;
  for (const log of logs) {
    if (Date.now() >= stopAt) break;
    await deliver(log.id);
    processed++;
    if (process.env.EMAIL_MODE !== "preview")
      await new Promise((resolve) => setTimeout(resolve, 550));
  }
  return processed;
}
