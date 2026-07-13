import type { StoredSession } from "./types";

export async function getStoredSession(): Promise<StoredSession | null> {
  const result = await chrome.storage.local.get("session");
  return (result.session as StoredSession | undefined) ?? null;
}
