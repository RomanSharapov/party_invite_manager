"use client";
import { use, useCallback, useEffect, useState } from "react";
import { api, dateLabel, Party, Invitee } from "@/lib/client";
export default function Manage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    base = `/api/parties/${id}`;
  const [p, setP] = useState<Party | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [filter, setFilter] = useState("ALL"),
    [sort, setSort] = useState("added"),
    [edit, setEdit] = useState<Invitee | null>(null),
    [csv, setCsv] = useState(""),
    [logs, setLogs] = useState<any[]>([]);
  const refresh = useCallback(async () => {
    const [party, emails] = await Promise.all([
      api<Party>(base),
      api<any[]>(`${base}/emails`),
    ]);
    setP(party);
    setLogs(emails);
  }, [base]);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function act(work: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!p)
    return (
      <main>
        {error ? (
          <div role="alert" className="error">
            {error} <a href="/login">Sign in</a>
          </div>
        ) : (
          <div className="loading">Opening your party…</div>
        )}
      </main>
    );
  const rows = p.invitees
    .filter(
      (i) => filter === "ALL" || (i.response?.status ?? "PENDING") === filter,
    )
    .sort((a, b) => (sort === "name" ? a.name.localeCompare(b.name) : 0));
  return (
    <main>
      <a className="back" href="/">
        ← All parties
      </a>
      <div className="page-title">
        <div>
          <p className="eyebrow">The guest list is growing</p>
          <h1>{p.title}</h1>
          <p>
            ◷ {dateLabel(p.startDateTime, p.timeZone)} · ⌖ {p.location}
          </p>
          <span className={`badge ${p.status.toLowerCase()}`}>
            {new Date(p.startDateTime) <= new Date() && p.status !== "CANCELLED"
              ? "PAST"
              : p.status}
          </span>
        </div>
        <div className="toolbar">
          <a className="button secondary" href={`/parties/${id}/edit`}>
            Edit details
          </a>
          <button
            disabled={busy}
            onClick={() =>
              act(
                () => api(`${base}/invitations`, "POST", { scope: "unsent" }),
                "Invitations queued. Delivery status appears below.",
              )
            }
          >
            Send invitations ↗
          </button>
        </div>
      </div>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="success">
          {notice}
        </div>
      )}
      <div className="stats">
        {[
          [p.totals.invited, "Guests invited"],
          [p.totals.responded, "Replies received"],
          [p.totals.attending, "Coming, including family"],
          [p.totals.declined, "Unable to come"],
        ].map(([n, label]) => (
          <div className="stat" key={label}>
            <strong>{n}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="section-title">
        <h2>Your people</h2>
        <div className="toolbar">
          <select
            aria-label="Filter responses"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="ALL">All responses</option>
            <option value="PENDING">Pending</option>
            <option value="ATTENDING">Attending</option>
            <option value="NOT_ATTENDING">Not attending</option>
          </select>
          <select
            aria-label="Sort invitees"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="added">Date added</option>
            <option value="name">Name A–Z</option>
          </select>
        </div>
      </div>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Invitee</th>
                <th>Response</th>
                <th>Family</th>
                <th>Message to you</th>
                <th>Invitation</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>{i.name}</strong>
                    <small>{i.guardianEmail}</small>
                    {i.note && <small>Note: {i.note}</small>}
                  </td>
                  <td>
                    <span
                      className={`badge ${(i.response?.status ?? "pending").toLowerCase()}`}
                    >
                      {i.response?.status.replaceAll("_", " ") ?? "Pending"}
                    </span>
                  </td>
                  <td>
                    {i.response?.status === "ATTENDING" ? (
                      <>
                        <strong>
                          {1 + i.response.additionalAttendees.length} coming
                        </strong>
                        {i.response.additionalAttendees.map((a, j) => (
                          <small key={j}>
                            {a.name}
                            {a.relationship ? ` · ${a.relationship}` : ""}
                          </small>
                        ))}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="message">{i.response?.message || "—"}</div>
                  </td>
                  <td>
                    <span className={`badge ${i.inviteStatus.toLowerCase()}`}>
                      {i.inviteStatus.replaceAll("_", " ")}
                    </span>
                    <div>
                      <a
                        className="text-button small"
                        href={`/rsvp/${i.inviteToken}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open invite ↗
                      </a>
                    </div>
                  </td>
                  <td>
                    <div className="toolbar">
                      <button
                        className="secondary small"
                        disabled={busy}
                        onClick={() => {
                          setEdit(i);
                          document
                            .getElementById("invitee-editor")
                            ?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="secondary small"
                        disabled={busy}
                        onClick={() =>
                          act(
                            () =>
                              api(`${base}/invitations`, "POST", {
                                scope: "individual",
                                inviteeId: i.id,
                              }),
                            "Invitation queued.",
                          )
                        }
                      >
                        Resend
                      </button>
                      <button
                        className="danger small"
                        disabled={busy}
                        onClick={() => {
                          if (
                            confirm(
                              `Remove ${i.name} and their RSVP? Their link will stop working.`,
                            )
                          )
                            act(
                              () =>
                                api(`${base}/invitees/${i.id}`, "DELETE", {}),
                              "Invitee removed.",
                            );
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="empty">
            {p.invitees.length
              ? "No guests match this filter."
              : "The best parties start with your favorite people. Add your first guest below."}
          </div>
        )}
      </section>
      <div className="split">
        <section className="panel" id="invitee-editor">
          <h2>{edit ? `Edit ${edit.name}` : "Add someone special"}</h2>
          <p className="hint">
            Each child gets their own private invitation link, even when sharing
            a guardian’s email.
          </p>
          <form
            key={edit?.id ?? "new"}
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const body = Object.fromEntries(new FormData(form));
              await act(
                async () => {
                  await api(
                    `${base}/invitees${edit ? `/${edit.id}` : ""}`,
                    edit ? "PATCH" : "POST",
                    body,
                  );
                  setEdit(null);
                  form.reset();
                },
                edit
                  ? "Invitee updated."
                  : "Guest added. Their invitation is ready to send.",
              );
            }}
          >
            <div className="form-grid">
              <label>
                Child’s name
                <input
                  name="name"
                  defaultValue={edit?.name}
                  required
                  maxLength={200}
                />
              </label>
              <label>
                Guardian’s email
                <input
                  name="guardianEmail"
                  type="email"
                  defaultValue={edit?.guardianEmail}
                  required
                />
              </label>
              <label className="full">
                Private note (optional)
                <input
                  name="note"
                  defaultValue={edit?.note ?? ""}
                  placeholder="From school, soccer team…"
                  maxLength={2000}
                />
              </label>
            </div>
            <div className="toolbar spaced">
              <button disabled={busy}>
                {edit ? "Save guest" : "＋ Add guest"}
              </button>
              {edit && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEdit(null)}
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
        </section>
        <section className="panel">
          <h2>Bring the whole list.</h2>
          <p className="hint">
            Paste or upload CSV with <strong>name,email</strong> columns.
            Optional: note. Every row is checked before anyone is added.
          </p>
          <label>
            Upload CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setCsv(await file.text());
              }}
            />
          </label>
          <label className="spaced">
            Or paste your list
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              placeholder={"name,email\nSam,parent@example.com"}
            />
          </label>
          <button
            className="secondary spaced"
            disabled={busy || !csv.trim()}
            onClick={() =>
              act(async () => {
                await api(`${base}/invitees`, "POST", { csv });
                setCsv("");
              }, "Your guest list has been imported.")
            }
          >
            Import guests →
          </button>
        </section>
      </div>
      <section className="panel">
        <div className="section-title" style={{ marginTop: 0 }}>
          <div>
            <h2>A little nudge</h2>
            <p className="hint">
              Send a reminder to everyone who hasn’t replied yet.
            </p>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              act(
                () =>
                  api(`${base}/invitations`, "POST", {
                    scope: "pending",
                    reminder: true,
                  }),
                "Reminders queued for guests who haven’t responded.",
              )
            }
          >
            Remind pending guests
          </button>
        </div>
        <p className="hint">
          Replies close{" "}
          {p.rsvpDeadline
            ? dateLabel(p.rsvpDeadline, p.timeZone)
            : `when the party starts (${p.timeZone})`}
          . There’s room for every additional family member.
        </p>
      </section>
      <section className="panel">
        <details>
          <summary>
            Email delivery · {logs.filter((l) => l.status === "FAILED").length}{" "}
            failed
          </summary>
          <p className="hint">
            Sent means accepted by the email provider. Preview messages stay in
            the local development inbox. The latest 100 messages are shown.
          </p>
          <button
            className="secondary small"
            disabled={busy}
            onClick={() =>
              act(
                () => api(`${base}/emails`, "POST", {}),
                "Pending and failed emails have been queued for delivery.",
              )
            }
          >
            Retry failed / process pending
          </button>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>To</th>
                  <th>Status</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td>{l.type.replaceAll("_", " ")}</td>
                    <td>{l.recipientEmail}</td>
                    <td>
                      <span className={`badge ${l.status.toLowerCase()}`}>
                        {l.status}
                      </span>
                    </td>
                    <td>{l.lastError || `${l.attempts} attempt(s)`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <button
        className="danger small"
        disabled={busy}
        onClick={() => {
          if (
            confirm(
              "Delete this party, its invitees, and all responses? This cannot be undone.",
            )
          )
            act(async () => {
              await api(base, "DELETE", {});
              window.location.href = "/";
            }, "Party deleted.");
        }}
      >
        Delete party
      </button>
    </main>
  );
}
