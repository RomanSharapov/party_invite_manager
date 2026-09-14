import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { ownedParty } from "@/lib/auth";
import { endpoint } from "@/lib/http";
import { flushEmails } from "@/lib/email";
export const maxDuration = 60;
export const GET = endpoint(async (_, ctx) => {
  const { id } = await ctx.params;
  await ownedParty(id);
  const logs = await db.notificationLog.findMany({
    where: { relatedPartyId: id },
    select: {
      id: true,
      type: true,
      recipientEmail: true,
      status: true,
      lastError: true,
      attempts: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(logs);
});
export const POST = endpoint(async (_, ctx) => {
  const { id } = await ctx.params;
  await ownedParty(id);
  await db.notificationLog.updateMany({
    where: { relatedPartyId: id, status: "FAILED" },
    data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date() },
  });
  const logs = await db.notificationLog.findMany({
    where: { relatedPartyId: id, status: "PENDING" },
    select: { id: true },
  });
  after(() => flushEmails(logs.map((l) => l.id)));
  return NextResponse.json({ queued: logs.length }, { status: 202 });
});
