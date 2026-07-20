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
    <div>
      <div className="form-grid">
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
          />
        </label>
      </div>
      <div className="check-row">
        <input
          id="show-workday-password"
          type="checkbox"
          checked={showPassword}
          onChange={(e) => setShowPassword(e.target.checked)}
        />
        <label htmlFor="show-workday-password">Show password</label>
      </div>
      <button className="btn-primary" onClick={handleSave} disabled={saving || !email || !password}>
        {saving ? "Saving..." : "Save credentials"}
      </button>
      {message && (
        <p className="card-muted" style={{ marginTop: 10, marginBottom: 0 }}>
          {message}
        </p>
      )}
    </div>
  );
}
