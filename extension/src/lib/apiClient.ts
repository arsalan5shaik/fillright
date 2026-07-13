import type {
  AnalyzeApplicationResult,
  AutofillData,
  JdLocation,
  ResolvedAnswer,
  ResumeContact,
  ScannedJobPosting,
  WorkdayCredentials,
} from "./types";

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

function restHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_ANON_KEY };
}

async function getProfileFields(accessToken: string): Promise<Record<string, string>> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/profile_fields?select=field_key,field_value`, {
    headers: restHeaders(accessToken),
  });
  if (!res.ok) throw new Error(`profile_fields lookup failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { field_key: string; field_value: string | null }[];
  const fields: Record<string, string> = {};
  for (const row of rows) {
    if (row.field_value) fields[row.field_key] = row.field_value;
  }
  return fields;
}

async function getDefaultResumeContact(accessToken: string): Promise<ResumeContact | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/resume_profiles?select=parsed_json&order=is_default.desc,updated_at.desc&limit=1`,
    { headers: restHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`resume_profiles lookup failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { parsed_json: { contact?: ResumeContact } }[];
  return rows[0]?.parsed_json?.contact ?? null;
}

/** Correlates common_questions (global, public read - id -> category) with
 * the caller's saved answers (via FastAPI, which decrypts sensitive ones)
 * to build a category -> answer_value map the fill engine can key off of. */
async function getCommonAnswersByCategory(accessToken: string): Promise<Record<string, string>> {
  const [questionsRes, answersRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/common_questions?select=id,category`, { headers: restHeaders(accessToken) }),
    apiFetch(accessToken, "/answers/common"),
  ]);
  if (!questionsRes.ok) throw new Error(`common_questions lookup failed: ${questionsRes.status}`);
  if (!answersRes.ok) throw new Error(`answers/common lookup failed: ${answersRes.status}`);

  const questions = (await questionsRes.json()) as { id: string; category: string }[];
  const answers = (await answersRes.json()) as { common_question_id: string; answer_value: string }[];
  const categoryById = new Map(questions.map((q) => [q.id, q.category]));

  const byCategory: Record<string, string> = {};
  for (const answer of answers) {
    const category = categoryById.get(answer.common_question_id);
    if (category) byCategory[category] = answer.answer_value;
  }
  return byCategory;
}

async function getMostRecentApplicationLocation(accessToken: string): Promise<JdLocation | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/applications?select=jd_analysis_json&order=created_at.desc&limit=1`,
    { headers: restHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`applications lookup failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { jd_analysis_json?: { locations?: JdLocation[] } }[];
  return rows[0]?.jd_analysis_json?.locations?.[0] ?? null;
}

/** Aggregates everything the fill engine needs into one bundle. Called from
 * the background worker (which alone has host_permissions/CORS clearance
 * for cross-origin fetch) in response to the content script's
 * GET_AUTOFILL_DATA message - the content script itself only touches the
 * DOM, never the network. */
export async function getAutofillData(accessToken: string): Promise<AutofillData> {
  const [profileFields, contact, commonAnswers, jdLocation] = await Promise.all([
    getProfileFields(accessToken),
    getDefaultResumeContact(accessToken),
    getCommonAnswersByCategory(accessToken),
    getMostRecentApplicationLocation(accessToken),
  ]);
  return { profileFields, contact, commonAnswers, jdLocation };
}

export async function resolveQuestion(accessToken: string, questionText: string): Promise<ResolvedAnswer> {
  const res = await apiFetch(accessToken, "/qa/resolve", {
    method: "POST",
    body: JSON.stringify({ question_text: questionText }),
  });
  if (!res.ok) throw new Error(`qa/resolve failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return { answerId: body.answer_id, answerText: body.answer_text, source: body.source, similarity: body.similarity };
}

export async function updateAnswer(accessToken: string, answerId: string, answerText: string): Promise<void> {
  const res = await apiFetch(accessToken, `/qa/answers/${answerId}`, {
    method: "PATCH",
    body: JSON.stringify({ answer_text: answerText }),
  });
  if (!res.ok) throw new Error(`update answer failed: ${res.status} ${await res.text()}`);
}

export async function deleteAnswer(accessToken: string, answerId: string): Promise<void> {
  const res = await apiFetch(accessToken, `/qa/answers/${answerId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(`delete answer failed: ${res.status} ${await res.text()}`);
}

async function getMostRecentTailoredResumePath(accessToken: string): Promise<string | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/applications?select=tailored_resume_url&tailored_resume_url=not.is.null&order=created_at.desc&limit=1`,
    { headers: restHeaders(accessToken) },
  );
  if (!res.ok) throw new Error(`applications lookup failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as { tailored_resume_url: string | null }[];
  return rows[0]?.tailored_resume_url ?? null;
}

/** Mints a signed URL for a private-bucket object, same as
 * app/db/storage.py's create_signed_url on the backend - done directly from
 * the extension since it's a plain read against the caller's own storage
 * object (RLS-protected via storage.objects policies), no server-side
 * secret logic involved. */
async function getSignedUrl(accessToken: string, bucket: string, path: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    headers: { ...restHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!res.ok) throw new Error(`sign url failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { signedURL: string };
  return `${SUPABASE_URL}/storage/v1${body.signedURL}`;
}

export interface TailoredResumeFile {
  blob: Blob;
  filename: string;
}

/** Finds the most recently tailored resume, mints a fresh signed URL for it
 * (the one returned at tailor-resume time isn't persisted anywhere and may
 * well have expired by the time the user reaches the file-upload step of a
 * real application), and downloads the PDF bytes. Returns null rather than
 * throwing if there's nothing to attach yet - the caller treats that as "no
 * tailored resume for this session", not an error. */
export async function getTailoredResumeFile(accessToken: string): Promise<TailoredResumeFile | null> {
  const path = await getMostRecentTailoredResumePath(accessToken);
  if (!path) return null;

  const signedUrl = await getSignedUrl(accessToken, "resumes", path);
  const pdfRes = await fetch(signedUrl);
  if (!pdfRes.ok) throw new Error(`resume download failed: ${pdfRes.status}`);

  const blob = await pdfRes.blob();
  const filename = path.split("/").pop() ?? "resume.pdf";
  return { blob, filename };
}

export async function getWorkdayCredentials(accessToken: string): Promise<WorkdayCredentials> {
  const res = await apiFetch(accessToken, "/profile/workday-credentials");
  if (!res.ok) throw new Error(`workday-credentials failed: ${res.status} ${await res.text()}`);
  return res.json();
}
