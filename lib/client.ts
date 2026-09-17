export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
export function dateLabel(date: string, timeZone?: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(date));
}
export type Extra = { name: string; relationship?: string | null };
export type Invitee = {
  id: string;
  name: string;
  guardianEmail: string | null;
  deliveryMethod: "email" | "manual_link";
  phone: string | null;
  linkSharedAt: string | null;
  note: string | null;
  inviteToken: string;
  inviteStatus: string;
  response: {
    status: string;
    message: string | null;
    additionalAttendees: Extra[];
  } | null;
};
export type Party = {
  host: { name: string };
  id: string;
  title: string;
  description: string;
  location: string;
  theme: string | null;
  timeZone: string;
  startDateTime: string;
  endDateTime: string | null;
  rsvpDeadline: string | null;
  status: string;
  coverImageUrl: string | null;
  invitees: Invitee[];
  totals: {
    invited: number;
    responded: number;
    attending: number;
    declined: number;
  };
};
