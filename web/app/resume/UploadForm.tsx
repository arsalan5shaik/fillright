"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function UploadForm() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profileName, setProfileName] = useState("Default Resume");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setMessage("Choose a file first.");
      return;
    }
    setLoading(true);
    setMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    const formData = new FormData();
    formData.append("file", file);
    formData.append("profile_name", profileName);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/resumes/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: formData,
    });

    setLoading(false);
    if (!res.ok) {
      setMessage(`Upload failed: ${await res.text()}`);
      return;
    }
    setMessage("Uploaded and parsed.");
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
  }

  return (
    <form onSubmit={handleUpload} style={{ marginBottom: 24, maxWidth: 360 }}>
      <label>
        Profile name
        <input value={profileName} onChange={(e) => setProfileName(e.target.value)} />
      </label>
      <label>
        Resume file (PDF or DOCX)
        <input ref={fileInputRef} type="file" accept=".pdf,.docx" />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Uploading..." : "Upload"}
      </button>
      {message && <p>{message}</p>}
    </form>
  );
}
