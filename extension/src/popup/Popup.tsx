import { type CSSProperties, useEffect, useState } from "react";

import { getValidSession } from "../lib/session";
import type { StoredSession } from "../lib/types";

const WEBSITE_URL = "http://localhost:3000";

export function Popup() {
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    getValidSession().then(setSession);
  }, []);

  const signedIn = Boolean(session);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.logo}>F</div>
        <div style={styles.title}>FillRight</div>
      </div>

      <div style={styles.statusRow}>
        <span
          style={{
            ...styles.dot,
            background: session === undefined ? "#cbd5e1" : signedIn ? "#22c55e" : "#f59e0b",
          }}
        />
        <span style={styles.statusText}>
          {session === undefined ? "Checking session…" : signedIn ? "Connected" : "Not signed in"}
        </span>
      </div>

      {signedIn && session ? (
        <p style={styles.detail}>
          Signed in as <strong>{session.user.email}</strong>. Visit a Workday job posting and FillRight will scan and
          autofill it for you.
        </p>
      ) : session === null ? (
        <>
          <p style={styles.detail}>Sign in on the FillRight website to connect the extension.</p>
          <a href={WEBSITE_URL} target="_blank" rel="noreferrer" style={styles.button}>
            Open FillRight
          </a>
        </>
      ) : null}
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    width: 280,
    padding: 16,
    boxSizing: "border-box",
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    color: "#1f2937",
    background: "#ffffff",
  },
  header: { display: "flex", alignItems: "center", gap: 8, marginBottom: 14 },
  logo: {
    width: 26,
    height: 26,
    borderRadius: 7,
    background: "linear-gradient(135deg, #22d3ee, #0891b2)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" },
  statusRow: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 },
  dot: { width: 9, height: 9, borderRadius: "50%", flex: "0 0 auto" },
  statusText: { fontSize: 13, fontWeight: 600 },
  detail: { fontSize: 12.5, lineHeight: 1.5, color: "#475569", margin: "0 0 12px" },
  button: {
    display: "inline-block",
    textDecoration: "none",
    textAlign: "center",
    background: "linear-gradient(135deg, #0ea5b7, #0891b2)",
    color: "#fff",
    fontWeight: 600,
    fontSize: 13,
    padding: "8px 16px",
    borderRadius: 9,
  },
};
