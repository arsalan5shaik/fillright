import type { Session } from "@supabase/supabase-js";

import { createSupabaseClient } from "../lib/supabase";
import type { StoredSession } from "../lib/types";

const supabase = createSupabaseClient();

function toStoredSession(session: Session): StoredSession {
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at ?? null,
    user: { id: session.user.id, email: session.user.email ?? null },
  };
}

async function relayCurrentSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    chrome.runtime.sendMessage({ type: "SESSION_UPDATE", session: toStoredSession(session) });
  }
}

relayCurrentSession();

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    chrome.runtime.sendMessage({ type: "SESSION_UPDATE", session: toStoredSession(session) });
  } else {
    chrome.runtime.sendMessage({ type: "SESSION_CLEARED" });
  }
});
