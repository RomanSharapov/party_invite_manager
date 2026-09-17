import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ownedParty } from "@/lib/auth";
import { endpoint, ApiError } from "@/lib/http";
import { inviteeSchema, inviteContact } from "@/lib/domain";
export const PATCH = endpoint(async (req, ctx) => {
  const { id, inviteeId } = await ctx.params;
  await ownedParty(id);
  const old = await db.invitee.findFirst({
    where: { id: inviteeId, partyId: id },
  });
  if (!old) throw new ApiError(404, "Invitee not found");
  const input = await req.json();
  const contact =
    input.contact !== undefined ? inviteContact(input.contact) : null;
  // Keep an email captured during RSVP when the host leaves the phone unchanged.
  if (contact?.phone && contact.phone === old.phone)
    contact.guardianEmail = old.guardianEmail;
  const data = inviteeSchema.parse({ ...old, ...input, ...(contact ?? {}) });
  const changedDelivery = data.deliveryMethod !== old.deliveryMethod;
  // Editing preserves this invitee's one permanent token and existing response.
  return NextResponse.json(
    await db.invitee.update({
      where: { id: inviteeId },
      data: {
        ...data,
        ...(changedDelivery
          ? {
              sentAt: null,
              inviteStatus:
                old.inviteStatus === "RESPONDED" ? "RESPONDED" : "NOT_SENT",
            }
          : {}),
      },
    }),
  );
});
export const DELETE = endpoint(async (_, ctx) => {
  const { id, inviteeId } = await ctx.params;
  await ownedParty(id);
  const result = await db.invitee.deleteMany({
    where: { id: inviteeId, partyId: id },
  });
  if (!result.count) throw new ApiError(404, "Invitee not found");
  return new Response(null, { status: 204 });
});
