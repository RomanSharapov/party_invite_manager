"use client";
import { useEffect, useState } from "react";
import { api, Invitee } from "@/lib/client";
import { shareMessage, smsHref } from "@/lib/invitation-copy";

export default function InviteSharing({
  invitee,
  action,
  title,
  hostName,
  base,
  onShared,
}: {
  invitee: Invitee;
  action: "copy" | "share";
  title: string;
  hostName: string;
  base: string;
  onShared: () => Promise<void>;
}) {
  const [canShare, setCanShare] = useState(false);
  const [url, setUrl] = useState("");
  const [appleDevice, setAppleDevice] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    setCanShare(typeof navigator.share === "function");
    setUrl(`${window.location.origin}/rsvp/${invitee.inviteToken}`);
    setAppleDevice(/iPad|iPhone|iPod|Mac/.test(navigator.platform));
  }, [invitee.inviteToken]);
  const text = shareMessage(title, invitee.name, hostName, url);
  async function record() {
    try {
      await api(`${base}/invitees/${invitee.id}/share`, "POST", {});
      setNotice("");
      await onShared();
    } catch {
      setNotice(
        "Sharing opened or link copied, but the shared timestamp could not be saved. Try again.",
      );
    }
  }
  async function copy() {
    setCopied(false);
    setBusy(true);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFallback(false);
      await record();
    } catch {
      setFallback(true);
      setNotice("Select the link below and copy it manually.");
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    setBusy(true);
    try {
      await navigator.share({ title, text, url });
      await record();
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError")) {
        setFallback(true);
        setNotice(
          "Sharing is unavailable. Use Copy Link or select the link below.",
        );
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="toolbar">
        {action === "share" &&
          (canShare ? (
            <button
              className="secondary small"
              disabled={busy || !url}
              onClick={share}
            >
              Share
            </button>
          ) : invitee.phone && url ? (
            <a
              className="button secondary small"
              href={smsHref(invitee.phone, text, appleDevice)}
              onClick={() => {
                void record();
              }}
            >
              Text Invite
            </a>
          ) : null)}
        {action === "copy" && (
          <button
            className="secondary small"
            disabled={busy || !url}
            onClick={copy}
            aria-live="polite"
          >
            {copied ? "✓ Copied!" : "Copy link"}
          </button>
        )}
      </div>
      {fallback && (
        <label>
          Personalized RSVP link
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            onCopy={() => {
              void record();
            }}
          />
        </label>
      )}
      {notice && <small role="status">{notice}</small>}
    </div>
  );
}
