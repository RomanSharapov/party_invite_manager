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
const optionalEmail = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? null : value),
  emailSchema.nullish(),
);
export function inviteContact(value: unknown): {
  deliveryMethod: "email" | "manual_link";
  guardianEmail: string | null;
  phone: string | null;
} {
  const contact = z
    .string()
    .trim()
    .min(1, "Enter a guardian email or phone number.")
    .max(254)
    .parse(value);
  if (contact.includes("@"))
    return {
      deliveryMethod: "email" as const,
      guardianEmail: emailSchema.parse(contact),
      phone: null,
    };
  const phone = z
    .string()
    .max(100)
    .regex(/^\+?[0-9().\s-]+$/, "Enter a valid email or phone number.")
    .refine((v) => {
      const digits = v.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 15;
    }, "Enter a phone number with 7–15 digits.")
    .parse(contact);
  return { deliveryMethod: "manual_link" as const, guardianEmail: null, phone };
}
export const inviteeSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    deliveryMethod: z.enum(["email", "manual_link"]).default("email"),
    guardianEmail: optionalEmail,
    phone: optionalText(100),
    note: optionalText(2000),
  })
  .superRefine((i, ctx) => {
    if (i.deliveryMethod === "email" && !i.guardianEmail)
      ctx.addIssue({
        code: "custom",
        path: ["guardianEmail"],
        message: "Email delivery requires a guardian email.",
      });
    if (i.deliveryMethod === "manual_link" && !i.guardianEmail && !i.phone)
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Manual Link requires a guardian email or phone number.",
      });
  });
export const rsvpSchema = z
  .object({
    status: z.enum(["ATTENDING", "NOT_ATTENDING"]),
    guardianEmail: optionalEmail,
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
  let rows: string[][];
  try {
    rows = parse(csv, {
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });
  } catch {
    throw new Error(
      "Invalid CSV. Use name,email/phone columns and quote values containing commas.",
    );
  }
  if (!rows.length) throw new Error("The CSV has no invitees.");
  const headers = rows[0].map((value) => value.trim().toLowerCase());
  const contactIndex = headers.findIndex((value) =>
    ["email", "phone", "contact", "email/phone"].includes(value),
  );
  const hasHeader = headers.includes("name") && contactIndex !== -1;
  const nameIndex = hasHeader ? headers.indexOf("name") : 0;
  const noteIndex = hasHeader ? headers.indexOf("note") : 2;
  const data = hasHeader ? rows.slice(1) : rows;
  if (!data.length) throw new Error("The CSV has no invitees.");
  return data.map((row, i) => {
    try {
      if (!hasHeader && (row.length < 2 || row.length > 3))
        throw new Error("Expected name, email/phone and optional note");
      return inviteeSchema.parse({
        name: row[nameIndex],
        ...inviteContact(row[hasHeader ? contactIndex : 1]),
        note: noteIndex >= 0 ? row[noteIndex] : undefined,
      });
    } catch {
      throw new Error(
        `CSV row ${i + (hasHeader ? 2 : 1)}: a name and valid email or phone number are required.`,
      );
    }
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
