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

  const list = profiles ?? [];

  return (
    <main>
      <h1>Your résumés</h1>
      <p className="muted">Upload a résumé — FillRight parses your work history, education, and skills to autofill from.</p>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Upload a résumé</h2>
        <UploadForm />
      </div>

      <div className="card">
        <h2>Saved résumés</h2>
        {list.length === 0 ? (
          <p className="empty">No résumés uploaded yet — upload one above to get started.</p>
        ) : (
          <ul className="link-list">
            {list.map((p) => (
              <li key={p.id}>
                <Link href={`/resume/${p.id}`}>{p.profile_name}</Link>
                {p.is_default && <span className="badge">Default</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
