import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireHost } from "@/lib/auth";
import { endpoint } from "@/lib/http";
import { partySchema, totals } from "@/lib/domain";
export const GET = endpoint(async () => {
  const host = await requireHost();
  const parties = await db.party.findMany({
    where: { hostUserId: host.id },
    include: {
      invitees: {
        include: { response: { include: { additionalAttendees: true } } },
      },
    },
    orderBy: { startDateTime: "desc" },
  });
  return NextResponse.json(
    parties.map(({ invitees, ...p }) => ({ ...p, totals: totals(invitees) })),
  );
});
export const POST = endpoint(async (req) => {
  const host = await requireHost();
  const data = partySchema.parse(await req.json());
  const party = await db.party.create({
    data: { ...data, hostUserId: host.id },
  });
  return NextResponse.json(party, {
    status: 201,
    headers: { Location: `/api/parties/${party.id}` },
  });
});
