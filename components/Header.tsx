"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
export default function Header() {
  const [name, setName] = useState("");
  useEffect(() => {
    api("/api/auth/me")
      .then((d) => setName(d.user?.name || ""))
      .catch(() => {});
  }, []);
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        <span className="brand-icon">✳</span>
        <span>
          party invite
          <span className="brand-small">
            A little planning. A lot of happy.
          </span>
        </span>
      </Link>
      <nav>
        {name ? (
          <>
            <span className="hello">Hi, {name.split(" ")[0]}</span>
            <button
              className="text-button"
              onClick={async () => {
                await api("/api/auth/logout", "POST", {});
                window.location.href = "/login";
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login">
            Host sign in <span aria-hidden>↗</span>
          </Link>
        )}
      </nav>
    </header>
  );
}
