import { z } from "zod";
import { parse } from "csv-parse/sync";
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
const optionalText = (max: number) => z.string().trim().max(max).nullish();
export const partySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10000).default(""),
    location: z.string().trim().min(1).max(1000),
    theme: optionalText(200),
    timeZone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Invalid time zone"),
    startDateTime: z.iso.datetime({ offset: true }),
    endDateTime: z.iso.datetime({ offset: true }).nullish(),
    rsvpDeadline: z.iso.datetime({ offset: true }).nullish(),
    status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]),
    coverImageUrl: z
      .union([
        z.literal(""),
        z
          .url()
          .refine((v) => v.startsWith("https://"), "Use an HTTPS image URL"),
      ])
      .nullish(),
  })
  .superRefine((p, c) => {
    if (p.endDateTime && new Date(p.endDateTime) <= new Date(p.startDateTime))
      c.addIssue({
        code: "custom",
        message: "End time must follow start time",
        path: ["endDateTime"],
      });
    if (p.rsvpDeadline && new Date(p.rsvpDeadline) > new Date(p.startDateTime))
      c.addIssue({
        code: "custom",
        message: "RSVP deadline cannot follow the party start",
        path: ["rsvpDeadline"],
      });
  });
export const inviteeSchema = z.object({
  name: z.string().trim().min(1).max(200),
  guardianEmail: emailSchema,
  note: optionalText(2000),
});
export const rsvpSchema = z
  .object({
    status: z.enum(["ATTENDING", "NOT_ATTENDING"]),
    message: optionalText(10000),
    additionalAttendees: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          relationship: optionalText(100),
        }),
      )
      .default([]),
  })
  .transform((v) => ({
    ...v,
    additionalAttendees: v.status === "ATTENDING" ? v.additionalAttendees : [],
  }));
export function parseInviteCsv(csv: string) {
  let rows: Record<string, string>[];
  try {
    rows = parse(csv, {
      columns: (headers: string[]) =>
        headers.map((h) => h.trim().toLowerCase()),
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } catch {
    throw new Error(
      "Invalid CSV. Use name,email columns and quote values containing commas.",
    );
  }
  if (!rows.length) throw new Error("The CSV has no invitees.");
  return rows.map((row, i) => {
    const r = inviteeSchema.safeParse({
      name: row.name,
      guardianEmail: row.email,
      note: row.note,
    });
    if (!r.success)
      throw new Error(`CSV row ${i + 2}: a name and valid email are required.`);
    return r.data;
  });
}
export function responseLocked(
  p: {
    status: string;
    rsvpDeadline: Date | string | null;
    startDateTime: Date | string;
  },
  now = new Date(),
) {
  return (
    p.status !== "PUBLISHED" ||
    now >= new Date(p.rsvpDeadline ?? p.startDateTime)
  );
}
export function totals(
  invitees: {
    response?: { status: string; additionalAttendees: unknown[] } | null;
  }[],
) {
  return {
    invited: invitees.length,
    responded: invitees.filter((i) => i.response).length,
    attending: invitees.reduce(
      (n, i) =>
        n +
        (i.response?.status === "ATTENDING"
          ? 1 + i.response.additionalAttendees.length
          : 0),
      0,
    ),
    declined: invitees.filter((i) => i.response?.status === "NOT_ATTENDING")
      .length,
  };
}
export function confirmedNames(
  invitees: {
    id: string;
    name: string;
    response: {
      status: string;
      additionalAttendees: { name: string }[];
    } | null;
  }[],
  excludeId: string,
) {
  return invitees
    .filter((i) => i.id !== excludeId && i.response?.status === "ATTENDING")
    .map((i) => ({
      name: i.name,
      additionalAttendees: i.response!.additionalAttendees.map((a) => ({
        name: a.name,
      })),
    }));
}
export function partyDate(p: {
  startDateTime: Date | string;
  timeZone: string;
}) {
  return (
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: p.timeZone,
    }).format(new Date(p.startDateTime)) + ` (${p.timeZone})`
  );
}
