"use client";
import { use, useCallback, useEffect, useState } from "react";
import { api, dateLabel, Extra } from "@/lib/client";
type Invitation = {
  invitee: { name: string; needsEmail: boolean };
  party: {
    title: string;
    description: string;
    location: string;
    theme: string | null;
    timeZone: string;
    startDateTime: string;
    endDateTime: string | null;
    rsvpDeadline: string | null;
    coverImageUrl: string | null;
    status: string;
    hostName: string;
  };
  response: {
    status: string;
    message: string | null;
    additionalAttendees: Extra[];
  } | null;
  locked: boolean;
  confirmedAttendees: {
    name: string;
    additionalAttendees: { name: string }[];
  }[];
};
export default function Rsvp({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params),
    [data, setData] = useState<Invitation | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [guardianEmail, setGuardianEmail] = useState(""),
    [message, setMessage] = useState(""),
    [extras, setExtras] = useState<Extra[]>([]);
  const load = useCallback(async () => {
    const d = await api<Invitation>(`/api/rsvp/${token}`);
    setData(d);
    setStatus(d.response?.status ?? "");
    setMessage(d.response?.message ?? "");
    setExtras(d.response?.additionalAttendees ?? []);
  }, [token]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  if (!data)
    return (
      <main className="guest">
        {error ? (
          <section className="panel">
            <h1>This invitation isn’t available.</h1>
            <p role="alert">
              {error}. Please check the original invitation link or contact your
              host.
            </p>
          </section>
        ) : (
          <div className="loading">Opening a little happiness…</div>
        )}
      </main>
    );
  const p = data.party,
    locked =
      data.locked || new Date() >= new Date(p.rsvpDeadline ?? p.startDateTime);
  return (
    <main className="guest">
      <section className="guest-hero">
        {p.coverImageUrl ? (
          <img
            className="cover"
            src={p.coverImageUrl}
            alt="Party cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="symbol" aria-hidden>
            🎂
          </div>
        )}
        <p className="eyebrow">{data.invitee.name}, you’re invited!</p>
        <h1>{p.title}</h1>
        <p>Hosted with love by {p.hostName}</p>
      </section>
      <section className="panel">
        <div className="form-grid">
          <div className="detail">
            <strong>◷ When</strong>
            <span>
              {dateLabel(p.startDateTime, p.timeZone)}
              {p.endDateTime && <> – {dateLabel(p.endDateTime, p.timeZone)}</>}
              <br />
              {p.timeZone}
            </span>
          </div>
          <div className="detail">
            <strong>⌖ Where</strong>
            <span>{p.location}</span>
          </div>
          {p.theme && (
            <div className="detail">
              <strong>✦ The theme</strong>
              <span>{p.theme}</span>
            </div>
          )}
          <div className="detail">
            <strong>♡ Please reply by</strong>
            <span>
              {dateLabel(p.rsvpDeadline ?? p.startDateTime, p.timeZone)}
            </span>
          </div>
        </div>
        {p.description && (
          <p className="pre-wrap" style={{ marginBottom: 0 }}>
            {p.description}
          </p>
        )}
      </section>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      <section className="panel">
        <p className="eyebrow">One little reply. One happy host.</p>
        <h2>{data.response ? "Your RSVP" : "Can you make it?"}</h2>
        {data.response && (
          <div className="success">
            <p>
              Saved response:{" "}
              {data.response.status === "ATTENDING"
                ? "Attending"
                : "Not attending"}
              {data.response.additionalAttendees.length > 0 &&
                ` · Also coming: ${data.response.additionalAttendees.map((a) => a.name).join(", ")}`}
            </p>
            <a
              className="button secondary"
              href={`/api/rsvp/${token}/calendar`}
            >
              Add to Calendar (.ics)
            </a>
          </div>
        )}
        {locked && (
          <div className="success" role="status">
            {p.status === "CANCELLED"
              ? "This party has been cancelled."
              : "The RSVP deadline has passed. Responses are now locked."}
            {data.response &&
              ` Your saved response: ${data.response.status === "ATTENDING" ? "Attending" : "Not attending"}.`}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!status) {
              setError("Please choose attending or not attending.");
              return;
            }
            setBusy(true);
            setError("");
            setNotice("");
            try {
              const result = await api(`/api/rsvp/${token}`, "PUT", {
                status,
                ...(data.invitee.needsEmail ? { guardianEmail } : {}),
                message,
                additionalAttendees: status === "ATTENDING" ? extras : [],
              });
              await load();
              setNotice(result.message);
            } catch (e) {
              setError((e as Error).message);
              try {
                const latest = await api<Invitation>(`/api/rsvp/${token}`);
                setData(latest);
              } catch {}
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="choice-row" role="group" aria-label="Your response">
            <button
              type="button"
              className="choice"
              aria-pressed={status === "ATTENDING"}
              disabled={locked || busy}
              onClick={() => setStatus("ATTENDING")}
            >
              ♡ We’ll be there!
            </button>
            <button
              type="button"
              className="choice"
              aria-pressed={status === "NOT_ATTENDING"}
              disabled={locked || busy}
              onClick={() => setStatus("NOT_ATTENDING")}
            >
              Can’t make it
            </button>
          </div>
          {status === "ATTENDING" && (
            <>
              <h3>Who’s coming along?</h3>
              <p className="hint">
                {data.invitee.name} is already included. Add siblings, parents,
                or other family members — as many as you need.
              </p>
              {extras.map((a, i) => (
                <div className="attendee-row" key={i}>
                  <label>
                    Name
                    <input
                      value={a.name}
                      required
                      maxLength={200}
                      disabled={locked || busy}
                      onChange={(e) =>
                        setExtras(
                          extras.map((a, j) =>
                            i === j ? { ...a, name: e.target.value } : a,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Relationship (optional)
                    <input
                      value={a.relationship ?? ""}
                      placeholder="Sibling, parent…"
                      maxLength={100}
                      disabled={locked || busy}
                      onChange={(e) =>
                        setExtras(
                          extras.map((a, j) =>
                            i === j
                              ? { ...a, relationship: e.target.value }
                              : a,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary small"
                    disabled={locked || busy}
                    aria-label={`Remove additional attendee ${i + 1}`}
                    onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                className="secondary small"
                type="button"
                disabled={locked || busy}
                onClick={() =>
                  setExtras([...extras, { name: "", relationship: "" }])
                }
              >
                ＋ Add family member
              </button>
            </>
          )}
          <label className="spaced">
            A note for {p.hostName} (optional)
            <textarea
              value={message}
              disabled={locked || busy}
              maxLength={10000}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Allergies, a little birthday wish, or anything your host should know…"
            />
            <span className="hint">Only your host can see this message.</span>
          </label>
          {data.invitee.needsEmail && (
            <label className="spaced">
              Want a confirmation? Enter your email (optional).
              <input
                type="email"
                maxLength={254}
                value={guardianEmail}
                disabled={locked || busy}
                onChange={(e) => setGuardianEmail(e.target.value)}
              />
            </label>
          )}
          <button className="spaced" disabled={locked || busy || !status}>
            {busy
              ? "Saving your reply…"
              : data.response
                ? "Update my RSVP →"
                : "Send my RSVP →"}
          </button>
          <p className="hint spaced">
            No account needed. Come back to this private link to change your
            reply before the deadline.
          </p>
        </form>
      </section>
      <section className="panel">
        <h2>A few familiar faces</h2>
        <p>Other guests who have said yes.</p>
        <div className="name-chips">
          {data.confirmedAttendees.flatMap((a, i) => [
            <span className="chip" key={`g${i}`}>
              {a.name}
            </span>,
            ...a.additionalAttendees.map((b, j) => (
              <span className="chip" key={`g${i}a${j}`}>
                {b.name}
              </span>
            )),
          ])}
        </div>
        {!data.confirmedAttendees.length && (
          <p className="hint">
            More happy replies are on their way. Check back soon!
          </p>
        )}
      </section>
    </main>
  );
}
