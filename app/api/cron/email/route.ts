import { NextResponse } from "next/server";
import { flushEmails } from "@/lib/email";
import { db } from "@/lib/db";
export const maxDuration = 60;
export async function GET(req: Request) {
  if (
    !process.env.CRON_SECRET ||
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const processed = await flushEmails();
  await db.rateLimit.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  return NextResponse.json({ processed });
}
