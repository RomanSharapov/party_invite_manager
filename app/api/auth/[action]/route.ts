import { NextResponse } from "next/server";
import { after } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { endpoint, ApiError, appUrl } from "@/lib/http";
import {
  createSession,
  hashToken,
  logout,
  randomToken,
  rateLimit,
} from "@/lib/auth";
import { enqueue, flushEmails, template } from "@/lib/email";
import { emailSchema } from "@/lib/domain";
export const runtime = "nodejs";
const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Use at most 72 characters")
  .refine(
    (v) => Buffer.byteLength(v, "utf8") <= 72,
    "Password must be at most 72 bytes",
  );
export const POST = endpoint(async (req, ctx) => {
  const { action } = await ctx.params;
  if (action === "logout") {
    await logout();
    return NextResponse.json({ ok: true });
  }
  const body = await req.json();
  const ip =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    "local";
  await rateLimit(`auth-ip:${ip}`, 60);
  if (action === "consume") {
    const data = z
      .object({ token: z.string().length(64), password: password.optional() })
      .parse(body);
    const tokenHash = hashToken(data.token);
    const userId = await db.$transaction(async (tx) => {
      const token = await tx.authToken.findUnique({ where: { tokenHash } });
      if (!token || token.expiresAt <= new Date())
        throw new ApiError(
          400,
          "This link is invalid or expired. Request a new one.",
        );
      if (token.type === "RESET_PASSWORD" && !data.password)
        throw new ApiError(400, "Enter a new password");
      const removed = await tx.authToken.deleteMany({
        where: { id: token.id },
      });
      if (!removed.count)
        throw new ApiError(400, "This link has already been used");
      await tx.user.update({
        where: { id: token.userId },
        data: {
          emailVerified: true,
          ...(token.type === "RESET_PASSWORD"
            ? { passwordHash: await bcrypt.hash(data.password!, 12) }
            : {}),
        },
      });
      if (token.type === "RESET_PASSWORD") {
        await tx.session.deleteMany({ where: { userId: token.userId } });
        await tx.authToken.deleteMany({
          where: { userId: token.userId, type: "RESET_PASSWORD" },
        });
      }
      return token.userId;
    });
    await createSession(userId);
    return NextResponse.json({ ok: true });
  }
  if (
    ![
      "signup",
      "login",
      "magic-link",
      "forgot-password",
      "verify-email",
    ].includes(action)
  )
    throw new ApiError(404, "Not found");
  const email = emailSchema.parse(body.email);
  await rateLimit(`auth-email:${email}`, 10);
  let user = await db.user.findUnique({ where: { email } });
  if (action === "login") {
    const pass = z.string().max(256).parse(body.password);
    const valid = await bcrypt.compare(
      pass,
      user?.passwordHash ||
        "$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW",
    );
    if (!user || !valid || !user.passwordHash)
      throw new ApiError(401, "Incorrect email or password");
    if (!user.emailVerified)
      throw new ApiError(
        403,
        "Please verify your email. Use ‘Resend verification’ to get a new link.",
      );
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  }
  if (action === "signup") {
    const name = z.string().trim().min(1).max(200).parse(body.name);
    const pass = password.parse(body.password);
    if (!user) {
      try {
        user = await db.user.create({
          data: { name, email, passwordHash: await bcrypt.hash(pass, 12) },
        });
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
      }
    }
  }
  // Passwordless sign-in doubles as verified passwordless signup.
  if (action === "magic-link" && !user)
    user = await db.user.upsert({
      where: { email },
      create: { email, name: email.split("@")[0] },
      update: {},
    });
  if (user && (action !== "verify-email" || !user.emailVerified)) {
    const type =
      action === "forgot-password"
        ? "RESET_PASSWORD"
        : action === "magic-link"
          ? "MAGIC_LINK"
          : "VERIFY_EMAIL";
    // Existing verified accounts are never changed by a signup request.
    if (action !== "signup" || !user.emailVerified) {
      const token = randomToken();
      await db.authToken.create({
        data: {
          userId: user.id,
          type,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      const label =
        type === "RESET_PASSWORD"
          ? "Reset your password"
          : type === "VERIFY_EMAIL"
            ? "Verify your email"
            : "Sign in to Party Invite Manager";
      const log = await enqueue({
        type: "AUTH",
        recipientEmail: email,
        ...template(
          label,
          [
            "This one-time link expires in 30 minutes. If you did not request it, you can ignore this email.",
          ],
          {
            label,
            url: `${appUrl()}/auth/confirm?token=${token}&type=${type}`,
          },
        ),
      });
      after(() => flushEmails([log.id]));
    }
  }
  return NextResponse.json(
    {
      message:
        "If this address is eligible, an email is on its way. Check your inbox.",
    },
    { status: 202 },
  );
});
