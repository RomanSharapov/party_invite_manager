"use client";
import { useEffect, useState } from "react";
import { api, Party } from "@/lib/client";
import { wallTimeToIso, isoToWallTime } from "@/lib/time";
export default function PartyForm({ id }: { id?: string }) {
  const [party, setParty] = useState<Party | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [zone, setZone] = useState("America/New_York"),
    [loading, setLoading] = useState(!!id);
  useEffect(() => {
    if (id)
      api<Party>(`/api/parties/${id}`)
        .then((p) => {
          setParty(p);
          setZone(p.timeZone);
          setLoading(false);
        })
        .catch((e) => {
          setError(e.message);
          setLoading(false);
        });
    else setZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, [id]);
  if (loading) return <div className="loading">Loading party…</div>;
  return (
    <>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = Object.fromEntries(
              new FormData(e.currentTarget),
            ) as Record<string, string>;
            const body = {
              ...data,
              startDateTime: wallTimeToIso(data.startDateTime, zone),
              endDateTime: data.endDateTime
                ? wallTimeToIso(data.endDateTime, zone)
                : null,
              rsvpDeadline: data.rsvpDeadline
                ? wallTimeToIso(data.rsvpDeadline, zone)
                : null,
            };
            const p = await api(
              `/api/parties${id ? `/${id}` : ""}`,
              id ? "PATCH" : "POST",
              body,
            );
            window.location.href = `/parties/${p.id}`;
          } catch (e) {
            setError((e as Error).message);
            setBusy(false);
          }
        }}
      >
        <div className="form-grid">
          <label className="full">
            Party title
            <input
              name="title"
              defaultValue={party?.title}
              placeholder="Mia’s magical 7th birthday"
              required
              maxLength={200}
            />
          </label>
          <label className="full">
            Location
            <input
              name="location"
              defaultValue={party?.location}
              placeholder="A place for happy memories"
              required
              maxLength={1000}
            />
          </label>
          <label>
            Starts
            <input
              name="startDateTime"
              type="datetime-local"
              defaultValue={
                party ? isoToWallTime(party.startDateTime, party.timeZone) : ""
              }
              required
            />
          </label>
          <label>
            Ends (optional)
            <input
              name="endDateTime"
              type="datetime-local"
              defaultValue={
                party?.endDateTime
                  ? isoToWallTime(party.endDateTime, party.timeZone)
                  : ""
              }
            />
          </label>
          <label>
            RSVP deadline (optional)
            <input
              name="rsvpDeadline"
              type="datetime-local"
              defaultValue={
                party?.rsvpDeadline
                  ? isoToWallTime(party.rsvpDeadline, party.timeZone)
                  : ""
              }
            />
            <span className="hint">
              Without a deadline, replies close when the party starts.
            </span>
          </label>
          <label>
            Time zone
            <input
              name="timeZone"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              list="zones"
              required
            />
            <datalist id="zones">
              {[
                "America/New_York",
                "America/Chicago",
                "America/Denver",
                "America/Los_Angeles",
                "Europe/London",
                "Europe/Paris",
                "Asia/Tokyo",
                "Australia/Sydney",
                "UTC",
              ].map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
            <span className="hint">All times above are in this time zone.</span>
          </label>
          <label>
            Theme (optional)
            <input
              name="theme"
              defaultValue={party?.theme ?? ""}
              placeholder="Dinosaurs, rainbows, outer space…"
              maxLength={200}
            />
          </label>
          <label>
            Status
            <select name="status" defaultValue={party?.status ?? "DRAFT"}>
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label className="full">
            A note for your guests
            <textarea
              name="description"
              defaultValue={party?.description}
              placeholder="What’s the plan? Anything they should bring?"
              maxLength={10000}
            />
          </label>
          <label className="full">
            Cover image URL (optional)
            <input
              name="coverImageUrl"
              type="url"
              defaultValue={party?.coverImageUrl ?? ""}
              placeholder="https://…"
            />
            <span className="hint">Use a hosted HTTPS image.</span>
          </label>
        </div>
        <div className="toolbar spaced">
          <button disabled={busy}>
            {busy ? "Saving…" : id ? "Save party" : "Create party →"}
          </button>
          <a className="button secondary" href={id ? `/parties/${id}` : "/"}>
            Cancel
          </a>
        </div>
      </form>
    </>
  );
}
