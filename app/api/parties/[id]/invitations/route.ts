import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { ownedParty } from "@/lib/auth";
import { endpoint, ApiError } from "@/lib/http";
import { invitationEmail, flushEmails } from "@/lib/email";
import { z } from "zod";
export const maxDuration = 60;
export const POST = endpoint(async (req, ctx) => {
  const { id } = await ctx.params;
  const party = await ownedParty(id);
  if (party.status !== "PUBLISHED" || party.startDateTime <= new Date())
    throw new ApiError(
      409,
      "Publish an upcoming party before sending invitations",
    );
  const input = z
    .object({
      scope: z.enum(["unsent", "pending", "individual"]).default("unsent"),
      inviteeId: z.string().optional(),
      reminder: z.boolean().default(false),
    })
    .parse(await req.json());
  if (input.scope === "individual" && !input.inviteeId)
    throw new ApiError(400, "Select an invitee");
  const invitees = await db.invitee.findMany({
    where: {
      partyId: id,
      deliveryMethod: "email",
      guardianEmail: { not: null },
      ...(input.scope === "individual"
        ? { id: input.inviteeId }
        : input.scope === "pending"
          ? { response: null }
          : { inviteStatus: "NOT_SENT" }),
    },
    include: { response: true },
  });
  if (input.scope === "individual" && !invitees.length)
    throw new ApiError(404, "Invitee not found");
  const logs = await db.$transaction(
    invitees.map((i) =>
      db.notificationLog.create({
        data: invitationEmail(party, i, input.reminder),
      }),
    ),
  );
  after(() => flushEmails(logs.map((l) => l.id)));
  return NextResponse.json({ queued: logs.length }, { status: 202 });
});
