import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ownedParty } from "@/lib/auth";
import { endpoint, ApiError } from "@/lib/http";

export const POST = endpoint(async (_, ctx) => {
  const { id, inviteeId } = await ctx.params;
  await ownedParty(id);
  const linkSharedAt = new Date();
  const result = await db.invitee.updateMany({
    where: { id: inviteeId, partyId: id },
    data: { linkSharedAt },
  });
  if (!result.count) throw new ApiError(404, "Invitee not found");
  return NextResponse.json({ linkSharedAt });
});
