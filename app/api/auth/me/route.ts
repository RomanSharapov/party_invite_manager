import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { endpoint } from "@/lib/http";
export const GET = endpoint(async () => {
  const u = await currentUser();
  return NextResponse.json({
    user: u
      ? {
          id: u.id,
          name: u.name,
          email: u.email,
          emailVerified: u.emailVerified,
        }
      : null,
  });
});
