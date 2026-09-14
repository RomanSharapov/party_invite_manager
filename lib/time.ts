export function isoToWallTime(iso: string, zone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function wallTimeToIso(wall: string, zone: string) {
  const target = Date.parse(`${wall}Z`);
  if (!Number.isFinite(target)) throw new Error("Enter a valid date and time");
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const local = isoToWallTime(new Date(guess).toISOString(), zone);
    const offset = Date.parse(`${local}Z`) - target;
    if (offset === 0) return new Date(guess).toISOString();
    guess -= offset;
  }
  throw new Error(
    "That local time does not exist because of daylight saving time. Choose another time.",
  );
}
