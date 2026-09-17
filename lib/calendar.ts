type CalendarParty = {
  id: string;
  title: string;
  description: string;
  location: string;
  startDateTime: Date;
  endDateTime: Date | null;
  status: string;
};
const escapeText = (s: string) =>
  s
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
const timestamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
function fold(line: string) {
  let result = "",
    bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > 75) {
      result += "\r\n ";
      bytes = 1;
    }
    result += char;
    bytes += size;
  }
  return result;
}
export function calendarFile(p: CalendarParty, now = new Date()) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Party Invite Manager//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${p.id}@party-invite`,
    `DTSTAMP:${timestamp(now)}`,
    `DTSTART:${timestamp(p.startDateTime)}`,
    ...(p.endDateTime ? [`DTEND:${timestamp(p.endDateTime)}`] : []),
    `SUMMARY:${escapeText(p.title)}`,
    `LOCATION:${escapeText(p.location)}`,
    `DESCRIPTION:${escapeText(p.description)}`,
    `STATUS:${p.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(fold)
    .join("\r\n");
}
