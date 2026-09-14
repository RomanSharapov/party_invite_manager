import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const appUrl = () =>
  new URL(process.env.APP_URL || "http://localhost:3000").origin;
export function endpoint(fn: (req: Request, ctx: any) => Promise<Response>) {
  return async (req: Request, ctx: any) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        const origin = req.headers.get("origin");
        if (origin && origin !== appUrl())
          throw new ApiError(403, "Untrusted origin");
        if (req.headers.get("sec-fetch-site") === "cross-site")
          throw new ApiError(403, "Cross-site request denied");
        if (!req.headers.get("content-type")?.includes("application/json"))
          throw new ApiError(415, "Use application/json");
      }
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError)
        return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError)
        return NextResponse.json(
          { error: e.issues.map((i) => i.message).join("; ") },
          { status: 400 },
        );
      if (e instanceof SyntaxError)
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      )
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      console.error(
        "Request failed",
        e instanceof Error ? e.name : "Unknown error",
      );
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }
  };
}
