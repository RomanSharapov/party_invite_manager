import { db } from "@/lib/db";
import { endpoint, ApiError } from "@/lib/http";
import { calendarFile } from "@/lib/calendar";

export const GET = endpoint(async (_, ctx) => {
  const { token } = await ctx.params;
  const invitee = await db.invitee.findUnique({
    where: { inviteToken: token },
    include: { party: true },
  });
  if (!invitee || invitee.party.status === "DRAFT")
    throw new ApiError(404, "Invitation not found");
  return new Response(calendarFile(invitee.party), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="party.ics"',
      "Cache-Control": "private, no-store",
    },
  });
});
