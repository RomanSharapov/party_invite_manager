import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ownedParty, randomToken } from "@/lib/auth";
import { endpoint, ApiError } from "@/lib/http";
import { inviteeSchema, parseInviteCsv, inviteContact } from "@/lib/domain";
import { z } from "zod";
export const GET = endpoint(async (_, ctx) => {
  const { id } = await ctx.params;
  await ownedParty(id);
  return NextResponse.json(
    await db.invitee.findMany({
      where: { partyId: id },
      include: { response: { include: { additionalAttendees: true } } },
      orderBy: { createdAt: "asc" },
    }),
  );
});
export const POST = endpoint(async (req, ctx) => {
  const { id } = await ctx.params;
  await ownedParty(id);
  const body = await req.json();
  let rows;
  if (typeof body.csv === "string") {
    try {
      rows = parseInviteCsv(body.csv);
    } catch (e) {
      throw new ApiError(400, (e as Error).message);
    }
  } else
    rows = z
      .array(inviteeSchema)
      .min(1)
      .parse(
        (Array.isArray(body) ? body : [body]).map((row) =>
          row.contact !== undefined
            ? { ...row, ...inviteContact(row.contact) }
            : row,
        ),
      );
  const invitees = await db.$transaction(
    rows.map((row) =>
      db.invitee.create({
        data: { ...row, partyId: id, inviteToken: randomToken() },
      }),
    ),
  );
  return NextResponse.json(invitees, { status: 201 });
});
