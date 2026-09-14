"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, dateLabel, Party } from "@/lib/client";
export default function Dashboard() {
  const [parties, setParties] = useState<Party[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [tab, setTab] = useState("upcoming");
  useEffect(() => {
    api("/api/auth/me")
      .then(async (d) => {
        if (!d.user) {
          window.location.href = "/login";
          return;
        }
        setParties(await api("/api/parties"));
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  const visible = parties.filter((p) =>
    tab === "past"
      ? new Date(p.startDateTime) <= new Date()
      : new Date(p.startDateTime) > new Date(),
  );
  return (
    <main>
      <div className="page-title">
        <div>
          <p className="eyebrow">Your celebration headquarters</p>
          <h1>Let the good times grow.</h1>
          <p>A little less organizing. A little more birthday magic.</p>
        </div>
        <Link className="button" href="/parties/new">
          ＋ Create party
        </Link>
      </div>
      <section className="hero">
        <div>
          <p className="eyebrow">Big smiles. Small details.</p>
          <h2>
            Every great party starts
            <br />
            with “you’re invited.”
          </h2>
          <p>
            Make it personal, keep everyone in the loop, and watch your guest
            list come together.
          </p>
        </div>
        <div className="hero-art" aria-hidden>
          🎂
        </div>
      </section>
      {error && (
        <div role="alert" className="error">
          {error}
        </div>
      )}
      <div className="section-title">
        <h2>
          Your parties <span className="muted">({parties.length})</span>
        </h2>
        <div className="toolbar">
          <button
            className={tab === "upcoming" ? "small" : "secondary small"}
            onClick={() => setTab("upcoming")}
          >
            Upcoming
          </button>
          <button
            className={tab === "past" ? "small" : "secondary small"}
            onClick={() => setTab("past")}
          >
            Past
          </button>
        </div>
      </div>
      {loading ? (
        <div className="loading">Gathering your celebrations…</div>
      ) : visible.length ? (
        <div className="grid">
          {visible.map((p, i) => (
            <Link key={p.id} className="party-card" href={`/parties/${p.id}`}>
              <div className="card-art" data-color={i % 3}>
                {p.coverImageUrl ? (
                  <img
                    src={p.coverImageUrl}
                    alt=""
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="party-symbol">
                    {["🎂", "🎈", "🎉"][i % 3]}
                  </span>
                )}
              </div>
              <div className="card-body">
                <p>
                  <span className={`badge ${p.status.toLowerCase()}`}>
                    {new Date(p.startDateTime) <= new Date() &&
                    p.status !== "CANCELLED"
                      ? "Past"
                      : p.status}
                  </span>
                </p>
                <h3>{p.title}</h3>
                <div className="card-meta">
                  ◷ {dateLabel(p.startDateTime, p.timeZone)}
                </div>
                <div className="card-meta">⌖ {p.location}</div>
                <div className="card-foot">
                  <span>
                    <strong>{p.totals.attending}</strong> coming ·{" "}
                    {p.totals.responded}/{p.totals.invited} replied
                  </span>
                  <strong>Manage ↗</strong>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <section className="panel empty">
          <h3>
            {tab === "past"
              ? "Memories in the making"
              : "Your next celebration starts here"}
          </h3>
          <p>
            {tab === "past"
              ? "Past parties will appear here after their event date."
              : "Create a party, add your people, and send a little happiness."}
          </p>
          {tab === "upcoming" && (
            <Link className="button" href="/parties/new">
              Create your first party →
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
