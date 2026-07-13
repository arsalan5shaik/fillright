import type { AnalyzeApplicationResult, ScannedJobPosting } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function apiFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
}

export async function analyzeJobDescription(
  accessToken: string,
  posting: ScannedJobPosting,
): Promise<AnalyzeApplicationResult> {
  const res = await apiFetch(accessToken, "/applications/analyze", {
    method: "POST",
    body: JSON.stringify({
      company: posting.company,
      requisition_id: posting.requisitionId,
      job_title: posting.jobTitle,
      job_url: posting.jobUrl,
      jd_text: posting.jdText,
    }),
  });
  if (!res.ok) throw new Error(`analyze failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function tailorResume(
  accessToken: string,
  applicationId: string,
  resumeProfileId: string,
): Promise<void> {
  const res = await apiFetch(accessToken, `/applications/${applicationId}/tailor-resume`, {
    method: "POST",
    body: JSON.stringify({ resume_profile_id: resumeProfileId }),
  });
  if (!res.ok) throw new Error(`tailor-resume failed: ${res.status} ${await res.text()}`);
}

export async function generateCoverLetter(
  accessToken: string,
  applicationId: string,
  resumeProfileId: string,
): Promise<void> {
  const res = await apiFetch(accessToken, `/applications/${applicationId}/cover-letter`, {
    method: "POST",
    body: JSON.stringify({ resume_profile_id: resumeProfileId }),
  });
  if (!res.ok) throw new Error(`cover-letter failed: ${res.status} ${await res.text()}`);
}

/** Reads resume_profiles directly via PostgREST (RLS-protected by the
 * caller's own token) - plain data reads don't need to go through FastAPI,
 * same pattern the website uses. */
export async function getDefaultResumeProfileId(accessToken: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/resume_profiles?select=id,is_default,updated_at&order=is_default.desc,updated_at.desc&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
    },
  );
  if (!res.ok) throw new Error(`resume_profiles lookup failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { id: string }[];
  return rows[0]?.id ?? null;
}
