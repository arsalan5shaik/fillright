"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function WorkdayCredentialsForm({
  initialEmail,
  initialPassword,
}: {
  initialEmail: string;
  initialPassword: string;
}) {
  const supabase = createClient();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/profile/workday-credentials`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${session?.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    setSaving(false);
    setMessage(res.ok ? "Saved." : `Failed to save: ${await res.text()}`);
  }

  return (
    <div style={{ maxWidth: 360 }}>
      <label style={{ display: "block", marginBottom: 8 }}>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        Password
        <input value={password} onChange={(e) => setPassword(e.target.value)} type={showPassword ? "text" : "password"} />
      </label>
      <label style={{ display: "block", marginBottom: 8 }}>
        <input
          type="checkbox"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
          style={{ display: "inline", width: "auto", marginRight: 6 }}
        />
        Show password
      </label>
      <button onClick={handleSave} disabled={saving || !email || !password}>
        {saving ? "Saving..." : "Save"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}
