import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { endpoint, ApiError } from "@/lib/http";
import {
  confirmedNames,
  responseLocked,
  rsvpSchema,
  totals,
} from "@/lib/domain";
import { rateLimit } from "@/lib/auth";
import { responseEmails, flushEmails } from "@/lib/email";
export const maxDuration = 60;
export const GET = endpoint(async (_, ctx) => {
  const { token } = await ctx.params;
  const invitee = await db.invitee.findUnique({
    where: { inviteToken: token },
    include: {
      response: { include: { additionalAttendees: true } },
      party: {
        include: {
          host: { select: { name: true } },
          invitees: {
            include: { response: { include: { additionalAttendees: true } } },
          },
        },
      },
    },
  });
  if (!invitee || invitee.party.status === "DRAFT")
    throw new ApiError(404, "Invitation not found");
  const p = invitee.party;
  return NextResponse.json({
    invitee: {
      name: invitee.name,
      needsEmail:
        invitee.deliveryMethod === "manual_link" && !invitee.guardianEmail,
    },
    party: {
      title: p.title,
      description: p.description,
      location: p.location,
      theme: p.theme,
      timeZone: p.timeZone,
      startDateTime: p.startDateTime,
      endDateTime: p.endDateTime,
      rsvpDeadline: p.rsvpDeadline,
      coverImageUrl: p.coverImageUrl,
      status: p.status,
      hostName: p.host.name,
    },
    response: invitee.response
      ? {
          status: invitee.response.status,
          message: invitee.response.message,
          additionalAttendees: invitee.response.additionalAttendees.map(
            (a) => ({ name: a.name, relationship: a.relationship }),
          ),
        }
      : null,
    locked: responseLocked(p),
    confirmedAttendees: confirmedNames(p.invitees, invitee.id),
  });
});
export const PUT = endpoint(async (req, ctx) => {
  const { token } = await ctx.params;
  const data = rsvpSchema.parse(await req.json());
  await rateLimit(`rsvp:${token}`, 30);
  let ids: string[] = [];
  let confirmationQueued = false;
  // Serializable transactions prevent duplicate responses and keep notification totals consistent.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      ids = await db.$transaction(
        async (tx) => {
          const i = await tx.invitee.findUnique({
            where: { inviteToken: token },
            include: {
              party: {
                include: { host: { select: { name: true, email: true } } },
              },
            },
          });
          if (!i || i.party.status === "DRAFT")
            throw new ApiError(404, "Invitation not found");
          if (responseLocked(i.party))
            throw new ApiError(
              409,
              i.party.status === "CANCELLED"
                ? "This party has been cancelled"
                : "The RSVP deadline has passed. Responses are locked.",
            );
          const response = await tx.rsvpResponse.upsert({
            where: { inviteeId: i.id },
            create: {
              inviteeId: i.id,
              status: data.status,
              message: data.message,
              additionalAttendees: { create: data.additionalAttendees },
            },
            update: {
              status: data.status,
              message: data.message ?? null,
              additionalAttendees: {
                deleteMany: {},
                create: data.additionalAttendees,
              },
            },
          });
          const guardianEmail =
            i.guardianEmail ??
            (i.deliveryMethod === "manual_link" ? data.guardianEmail : null) ??
            null;
          await tx.invitee.update({
            where: { id: i.id },
            data: { inviteStatus: "RESPONDED", guardianEmail },
          });
          const all = await tx.invitee.findMany({
            where: { partyId: i.partyId },
            include: { response: { include: { additionalAttendees: true } } },
          });
          const emails = responseEmails(
            i.party,
            { ...i, guardianEmail },
            { ...response, additionalAttendees: data.additionalAttendees },
            totals(all),
          );
          confirmationQueued = !!guardianEmail;
          const logs = [];
          for (const email of emails)
            logs.push((await tx.notificationLog.create({ data: email })).id);
          return logs;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      break;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2034", "P2002"].includes(e.code)
      ) {
        if (attempt < 3) continue;
        throw new ApiError(
          409,
          "Another response is being saved. Please try again.",
        );
      }
      throw e;
    }
  }
  after(() => flushEmails(ids));
  return NextResponse.json({
    message: confirmationQueued
      ? "Your response is saved. A confirmation email has been queued."
      : "Your response is saved.",
  });
});
