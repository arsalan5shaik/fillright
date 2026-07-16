"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Non-sensitive job-preference fields applications commonly ask for that
// aren't already covered by the résumé (work/education/skills) or the
// common-questions page (work authorization, sponsorship, salary bands,
// relocation, remote, EEO). Stored as flexible profile_fields (no schema
// change) and autofilled by the extension via their fieldMap concepts.
const FIELDS: { key: string; label: string; type: "text" | "select"; options?: string[]; placeholder?: string }[] = [
  { key: "years_experience", label: "Years of experience", type: "text", placeholder: "e.g. 4" },
  { key: "desired_salary", label: "Desired salary", type: "text", placeholder: "e.g. 120000" },
  { key: "available_start_date", label: "Earliest start date", type: "text", placeholder: "e.g. 2 weeks / 2026-08-01" },
  { key: "preferred_location", label: "Preferred work location", type: "text", placeholder: "e.g. Austin, TX or Remote" },
  { key: "willing_to_relocate", label: "Willing to relocate", type: "select", options: ["", "Yes", "No"] },
];

export default function JobPreferencesForm({ initialValues }: { initialValues: Record<string, string> }) {
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

    const rows = FIELDS.map(({ key }) => ({ user_id: user.id, field_key: key, field_value: values[key] ?? "" }));
    const { error } = await supabase.from("profile_fields").upsert(rows, { onConflict: "user_id,field_key" });

    setSaving(false);
    setMessage(error ? error.message : "Saved.");
  }

  return (
    <div>
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label htmlFor={f.key}>{f.label}</label>
          {f.type === "select" ? (
            <select
              id={f.key}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            >
              {f.options!.map((o) => (
                <option key={o} value={o}>
                  {o || "—"}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={f.key}
              placeholder={f.placeholder}
              value={values[f.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <button className="btn-primary" onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save preferences"}
      </button>
      {message && <p className="card-muted" style={{ marginTop: 10 }}>{message}</p>}
    </div>
  );
}
