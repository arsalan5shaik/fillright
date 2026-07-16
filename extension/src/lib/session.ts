import type { StoredSession } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// Refresh proactively once a token is within this many seconds of expiring,
// rather than waiting for a request to actually fail with it.
const REFRESH_BUFFER_SECONDS = 60;

async function getStoredSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.local.get("session");
  return (result.session as StoredSession | undefined) ?? null;
}

function isExpired(session: StoredSession): boolean {
  if (session.expires_at === null) return false;
  return session.expires_at * 1000 - REFRESH_BUFFER_SECONDS * 1000 <= Date.now();
}

interface RefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email: string | null };
}

async function refreshSession(refreshToken: string): Promise<StoredSession | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!res.ok) return null;

  const body = (await res.json()) as RefreshResponse;
  const refreshed: StoredSession = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: body.expires_at ?? null,
    user: { id: body.user.id, email: body.user.email ?? null },
  };
  await chrome.storage.local.set({ session: refreshed });
  return refreshed;
}

/** The extension only ever gets a fresh token relayed to it while the
 * website tab is open (Supabase's own auto-refresh timer runs there, in
 * website-bridge.ts, not in the background worker) - so a session cached
 * hours ago, after that tab was closed, would otherwise sit in storage
 * looking "signed in" but fail every real API call with a 401 once the
 * access token's ~1 hour lifetime passes (confirmed live: "analyze failed:
 * 401 Invalid or expired token" mid-testing session). Refreshes proactively
 * here instead, using the longer-lived refresh_token directly against
 * Supabase's REST API - no website tab needs to be open at all. Clears the
 * stored session (forcing a real "not signed in" prompt) only if the
 * refresh_token itself has also expired. */
export async function getValidSession(): Promise<StoredSession | null> {
  const session = await getStoredSession();
  if (!session) return null;
  if (!isExpired(session)) return session;

  const refreshed = await refreshSession(session.refresh_token);
  if (refreshed) return refreshed;

  await chrome.storage.local.remove("session");
  return null;
}
