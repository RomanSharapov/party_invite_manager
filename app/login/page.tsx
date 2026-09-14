"use client";
import { useState } from "react";
import { api } from "@/lib/client";
export default function Login() {
  const [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const titles: Record<string, string> = {
    login: "Welcome back.",
    signup: "Let’s start celebrating.",
    "magic-link": "A little magic. No password.",
    "forgot-password": "A fresh start.",
    "verify-email": "Verify your email.",
  };
  return (
    <main className="auth">
      <p className="eyebrow">Good parties start here</p>
      <h1>{titles[mode]}</h1>
      <p>Your guest list, happy replies, and party plans. All in one place.</p>
      <div className="auth-tabs">
        <button
          className={mode === "login" ? "" : "secondary"}
          onClick={() => {
            setMode("login");
            setError("");
            setMessage("");
          }}
        >
          Sign in
        </button>
        <button
          className={mode === "signup" ? "" : "secondary"}
          onClick={() => {
            setMode("signup");
            setError("");
            setMessage("");
          }}
        >
          Create account
        </button>
      </div>
      <section className="panel">
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        {message && (
          <div role="status" className="success">
            {message}
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setMessage("");
            try {
              const data = Object.fromEntries(new FormData(e.currentTarget));
              const r = await api(`/api/auth/${mode}`, "POST", data);
              if (mode === "login") window.location.href = "/";
              else setMessage(r.message);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "signup" && (
            <label className="field">
              Your name
              <input name="name" autoComplete="name" required maxLength={200} />
            </label>
          )}
          <label className="field">
            Email address
            <input name="email" type="email" autoComplete="email" required />
          </label>
          {["login", "signup"].includes(mode) && (
            <label className="field">
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={mode === "signup" ? 10 : 1}
                maxLength={72}
              />
              {mode === "signup" && (
                <span className="hint">At least 10 characters.</span>
              )}
            </label>
          )}
          <button disabled={busy} style={{ width: "100%" }}>
            {busy
              ? "One moment…"
              : mode === "login"
                ? "Sign in →"
                : mode === "signup"
                  ? "Create account →"
                  : "Send email link →"}
          </button>
        </form>
        <div className="auth-links">
          {[
            ["magic-link", "Email me a sign-in link"],
            ["forgot-password", "Forgot password?"],
            ["verify-email", "Resend verification"],
          ].map(([key, label]) => (
            <button
              key={key}
              className="text-button"
              onClick={() => {
                setMode(key);
                setError("");
                setMessage("");
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
      <p className="hint">
        Here to RSVP? Open the private link in your invitation. No account
        needed.
      </p>
    </main>
  );
}
