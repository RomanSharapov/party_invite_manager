"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
export default function Confirm() {
  const [token, setToken] = useState(""),
    [reset, setReset] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    setToken(p.get("token") || "");
    setReset(p.get("type") === "RESET_PASSWORD");
    window.history.replaceState(null, "", "/auth/confirm");
  }, []);
  return (
    <main className="auth">
      <section className="panel">
        <p className="eyebrow">Your personal invitation to plan</p>
        <h1>{reset ? "Reset your password" : "You’re one click away."}</h1>
        <p>
          {reset
            ? "Choose a new password to secure your account."
            : "Confirm to verify your email and sign in."}
        </p>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const data = Object.fromEntries(new FormData(e.currentTarget));
              await api("/api/auth/consume", "POST", { token, ...data });
              window.location.href = "/";
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {reset && (
            <label className="field">
              New password
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={72}
                required
              />
            </label>
          )}
          <button disabled={busy || !token}>
            {busy
              ? "Signing in…"
              : reset
                ? "Save password & sign in"
                : "Confirm & sign in →"}
          </button>
        </form>
        <p className="spaced">
          <a href="/login">Request a new link</a>
        </p>
      </section>
    </main>
  );
}
