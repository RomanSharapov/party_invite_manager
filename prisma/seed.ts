import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
const db = new PrismaClient();
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("Demo seeding is disabled in production");
  const host = await db.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: {
      name: "Alex Morgan",
      email: "demo@example.com",
      emailVerified: true,
      passwordHash: await bcrypt.hash("BirthdayDemo123!", 12),
    },
  });
  const existing = await db.party.findFirst({
    where: { hostUserId: host.id, title: "Mia’s garden birthday" },
  });
  if (existing) {
    console.log(
      "Demo already exists. Host: demo@example.com / BirthdayDemo123!",
    );
    return;
  }
  const start = new Date(Date.now() + 21 * 86400000);
  start.setUTCHours(18, 0, 0, 0);
  const party = await db.party.create({
    data: {
      hostUserId: host.id,
      title: "Mia’s garden birthday",
      description:
        "Mia is turning seven! Join us for garden games, a little crafting, and a whole lot of cake. Bring your picnic blanket and your favorite party people.",
      location: "123 Meadow Lane · Back garden",
      theme: "Garden magic",
      timeZone: "America/New_York",
      startDateTime: start,
      endDateTime: new Date(+start + 3 * 3600000),
      rsvpDeadline: new Date(+start - 3 * 86400000),
      status: "PUBLISHED",
    },
  });
  for (const [name, email, status, extras, message] of [
    [
      "Oliver",
      "oliver.parent@example.com",
      "ATTENDING",
      [
        { name: "Ella", relationship: "sibling" },
        { name: "Jamie", relationship: "parent" },
      ],
      "Can’t wait! Oliver has a peanut allergy.",
    ],
    [
      "Amelia",
      "amelia.parent@example.com",
      "ATTENDING",
      [],
      "We’ll bring a picnic blanket!",
    ],
    [
      "Noah",
      "noah.parent@example.com",
      "NOT_ATTENDING",
      [],
      "We’re away that weekend. Happy birthday, Mia!",
    ],
    ["Sophia", "sophia.parent@example.com", null, [], null],
    ["Liam", "liam.parent@example.com", null, [], null],
  ] as const) {
    const token = randomBytes(32).toString("hex");
    await db.invitee.create({
      data: {
        partyId: party.id,
        name,
        guardianEmail: email,
        inviteToken: token,
        inviteStatus: status
          ? "RESPONDED"
          : name === "Sophia"
            ? "SENT"
            : "NOT_SENT",
        note: "From school",
        ...(status
          ? {
              response: {
                create: {
                  status,
                  message,
                  additionalAttendees: { create: [...extras] },
                },
              },
            }
          : {}),
      },
    });
    console.log(
      `${name} (${status ?? "PENDING"}): ${process.env.APP_URL ?? "http://localhost:3000"}/rsvp/${token}`,
    );
  }
  await db.party.create({
    data: {
      hostUserId: host.id,
      title: "A space adventure",
      description: "Planning our next big adventure.",
      location: "Planetarium",
      startDateTime: new Date(+start + 60 * 86400000),
      timeZone: "America/New_York",
      theme: "Outer space",
      status: "DRAFT",
    },
  });
  console.log("Host: demo@example.com / BirthdayDemo123!");
  console.log(
    `Dashboard: ${process.env.APP_URL ?? "http://localhost:3000"}/parties/${party.id}`,
  );
}
main().finally(() => db.$disconnect());
