"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const FIELD_LABELS: Record<string, string> = {
  first_name: "First name",
  last_name: "Last name",
  phone: "Phone",
  address_line1: "Address line 1",
  address_line2: "Address line 2",
  city: "City",
  state: "State",
  zip_code: "ZIP code",
  country: "Country",
  linkedin_url: "LinkedIn URL",
  portfolio_url: "Portfolio URL",
  github_url: "GitHub URL",
};

export default function ProfileFieldsForm({ initialValues }: { initialValues: Record<string, string> }) {
  const supabase = createClient();
  const [values, setValues] = useState(initialValues);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return;
    }

    const rows = Object.entries(values).map(([field_key, field_value]) => ({
      user_id: user.id,
      field_key,
      field_value,
    }));

    const { error } = await supabase.from("profile_fields").upsert(rows, { onConflict: "user_id,field_key" });

    setSaving(false);
    setMessage(error ? error.message : "Saved.");
  }

  return (
    <div style={{ maxWidth: 360 }}>
      {Object.keys(FIELD_LABELS).map((key) => (
        <label key={key} style={{ display: "block", marginBottom: 8 }}>
          {FIELD_LABELS[key]}
          <input
            value={values[key] ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        </label>
      ))}
      <button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save"}
      </button>
      {message && <p>{message}</p>}
    </div>
  );
}
