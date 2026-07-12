import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ResumeProfileSummary } from "@/lib/types";
import UploadForm from "./UploadForm";

export default async function ResumePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profiles } = await supabase
    .from("resume_profiles")
    .select("id, profile_name, is_default, updated_at")
    .order("updated_at", { ascending: false })
    .returns<ResumeProfileSummary[]>();

  return (
    <main style={{ padding: 24, maxWidth: 480 }}>
      <p>
        <Link href="/">Back home</Link>
      </p>
      <h1>Your resumes</h1>
      <UploadForm />
      <ul>
        {(profiles ?? []).map((p) => (
          <li key={p.id}>
            <Link href={`/resume/${p.id}`}>{p.profile_name}</Link>
            {p.is_default && " (default)"}
          </li>
        ))}
      </ul>
      {(profiles ?? []).length === 0 && <p>No resumes uploaded yet.</p>}
    </main>
  );
}
