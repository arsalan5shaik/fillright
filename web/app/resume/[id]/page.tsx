import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ParsedResume } from "@/lib/types";
import ResumeEditor from "./ResumeEditor";

export default async function ResumeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile, error } = await supabase
    .from("resume_profiles")
    .select("id, profile_name, parsed_json")
    .eq("id", id)
    .single<{ id: string; profile_name: string; parsed_json: ParsedResume }>();

  if (error || !profile) {
    notFound();
  }

  return (
    <main>
      <Link href="/resume" className="back-link">
        ← Back to résumés
      </Link>
      <h1>{profile.profile_name}</h1>
      <p className="muted">Review and correct what FillRight parsed — this is what gets autofilled.</p>
      <div style={{ marginTop: 20 }}>
        <ResumeEditor resumeId={profile.id} initialData={profile.parsed_json} />
      </div>
    </main>
  );
}
