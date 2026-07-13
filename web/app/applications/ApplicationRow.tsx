"use client";

import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";

const STATUS_OPTIONS = ["applied", "interviewing", "rejected", "offer", "ghosted"] as const;

export interface ApplicationWithDocs {
  id: string;
  company: string;
  job_title: string | null;
  requisition_id: string | null;
  status: string;
  created_at: string;
  resumeUrl: string | null;
  coverLetterUrl: string | null;
}

export default function ApplicationRow({ application }: { application: ApplicationWithDocs }) {
  const supabase = createClient();
  const [status, setStatus] = useState(application.status);
  const [saving, setSaving] = useState(false);

  async function handleStatusChange(e: ChangeEvent<HTMLSelectElement>) {
    const newStatus = e.target.value;
    setStatus(newStatus);
    setSaving(true);
    await supabase.from("applications").update({ status: newStatus }).eq("id", application.id);
    setSaving(false);
  }

  return (
    <tr style={{ borderBottom: "1px solid #333" }}>
      <td>{application.company}</td>
      <td>{application.job_title ?? "-"}</td>
      <td>{new Date(application.created_at).toLocaleDateString()}</td>
      <td>
        <select value={status} onChange={handleStatusChange} disabled={saving}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </td>
      <td>
        {application.resumeUrl && (
          <a href={application.resumeUrl} target="_blank" rel="noreferrer">
            Resume
          </a>
        )}
        {application.resumeUrl && application.coverLetterUrl && " | "}
        {application.coverLetterUrl && (
          <a href={application.coverLetterUrl} target="_blank" rel="noreferrer">
            Cover letter
          </a>
        )}
        {!application.resumeUrl && !application.coverLetterUrl && "-"}
      </td>
    </tr>
  );
}
