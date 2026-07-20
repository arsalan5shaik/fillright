import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApplicationRow, { type ApplicationWithDocs } from "./ApplicationRow";

interface ApplicationSummary {
  id: string;
  company: string;
  job_title: string | null;
  requisition_id: string | null;
  status: string;
  created_at: string;
  tailored_resume_url: string | null;
  cover_letter_url: string | null;
}

export default async function ApplicationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: applications } = await supabase
    .from("applications")
    .select("id, company, job_title, requisition_id, status, created_at, tailored_resume_url, cover_letter_url")
    .order("created_at", { ascending: false })
    .returns<ApplicationSummary[]>();

  const withDocs: ApplicationWithDocs[] = await Promise.all(
    (applications ?? []).map(async (app) => {
      const [resumeSigned, coverLetterSigned] = await Promise.all([
        app.tailored_resume_url
          ? supabase.storage.from("resumes").createSignedUrl(app.tailored_resume_url, 3600)
          : Promise.resolve({ data: null }),
        app.cover_letter_url
          ? supabase.storage.from("resumes").createSignedUrl(app.cover_letter_url, 3600)
          : Promise.resolve({ data: null }),
      ]);
      return {
        ...app,
        resumeUrl: resumeSigned.data?.signedUrl ?? null,
        coverLetterUrl: coverLetterSigned.data?.signedUrl ?? null,
      };
    }),
  );

  return (
    <main>
      <h1>Your applications</h1>
      <p className="muted">Every posting you&apos;ve scanned, with its tailored résumé and cover letter.</p>

      <div className="card" style={{ marginTop: 20, overflowX: "auto" }}>
        {withDocs.length === 0 ? (
          <p className="empty">No applications yet — scan a job posting with the extension to get started.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Applied</th>
                <th>Status</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {withDocs.map((app) => (
                <ApplicationRow key={app.id} application={app} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
