import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ownedParty } from "@/lib/auth";
import { endpoint } from "@/lib/http";
import { partySchema, totals } from "@/lib/domain";
export const GET = endpoint(async (_, ctx) => {
  const { id } = await ctx.params;
  const party = await ownedParty(id);
  const invitees = await db.invitee.findMany({
    where: { partyId: id },
    include: { response: { include: { additionalAttendees: true } } },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ ...party, invitees, totals: totals(invitees) });
});
export const PATCH = endpoint(async (req, ctx) => {
  const { id } = await ctx.params;
  const p = await ownedParty(id);
  const body = await req.json();
  const data = partySchema.parse({
    ...p,
    startDateTime: p.startDateTime.toISOString(),
    endDateTime: p.endDateTime?.toISOString() ?? null,
    rsvpDeadline: p.rsvpDeadline?.toISOString() ?? null,
    ...body,
  });
  return NextResponse.json(await db.party.update({ where: { id }, data }));
});
export const DELETE = endpoint(async (_, ctx) => {
  const { id } = await ctx.params;
  await ownedParty(id);
  await db.party.delete({ where: { id } });
  return new Response(null, { status: 204 });
});
