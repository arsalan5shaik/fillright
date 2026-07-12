import { useEffect, useState } from "react";

import type { StoredSession } from "../lib/types";

export function Popup() {
  const [session, setSession] = useState<StoredSession | null | undefined>(undefined);

  useEffect(() => {
    chrome.storage.local.get("session").then((result) => {
      setSession((result.session as StoredSession | undefined) ?? null);
    });
  }, []);

  return (
    <div style={{ padding: 16, width: 260, fontFamily: "system-ui, sans-serif" }}>
      <h3 style={{ margin: "0 0 8px" }}>FillRight</h3>
      {session === undefined && <p>Loading...</p>}
      {session === null && <p>Not signed in. Log in on the FillRight website to connect.</p>}
      {session && <p>Signed in as {session.user.email}</p>}
    </div>
  );
}
