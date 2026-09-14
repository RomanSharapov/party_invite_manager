import { randomBytes, createHmac } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import { ApiError } from "./http";
export const randomToken = () => randomBytes(32).toString("hex");
export function hashToken(token: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  return createHmac("sha256", secret).update(token).digest("hex");
}
const cookieName =
  process.env.NODE_ENV === "production"
    ? "__Host-party_session"
    : "party_session";
export async function currentUser() {
  const value = (await cookies()).get(cookieName)?.value;
  if (!value) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(value) },
    include: { user: true },
  });
  return session && session.expiresAt > new Date() ? session.user : null;
}
export async function requireHost() {
  const user = await currentUser();
  if (!user) throw new ApiError(401, "Please sign in");
  if (!user.emailVerified) throw new ApiError(403, "Verify your email first");
  return user;
}
export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 86400000);
  await db.session.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  (await cookies()).set(cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}
export async function logout() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token)
    await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(cookieName);
}
export async function rateLimit(
  key: string,
  limit = 10,
  windowMs = 15 * 60000,
) {
  const bucket = Math.floor(Date.now() / windowMs);
  const entry = await db.rateLimit.upsert({
    where: { key: hashToken(`${key}:${bucket}`) },
    create: {
      key: hashToken(`${key}:${bucket}`),
      expiresAt: new Date((bucket + 1) * windowMs),
    },
    update: { count: { increment: 1 } },
  });
  if (entry.count > limit)
    throw new ApiError(429, "Too many attempts. Please try again later.");
}
export async function ownedParty(id: string) {
  const user = await requireHost();
  const party = await db.party.findFirst({
    where: { id, hostUserId: user.id },
    include: { host: { select: { name: true, email: true } } },
  });
  if (!party) throw new ApiError(404, "Party not found");
  return party;
}
