import {
  analyzeJobDescription,
  deleteAnswer,
  generateCoverLetter,
  getAutofillData,
  getCoverLetterFile,
  getDefaultResumeProfileId,
  getTailoredResumeFile,
  getTailoredResumeUrl,
  resolveChoice,
  resolveQuestion,
  tailorResume,
  updateAnswer,
} from "../lib/apiClient";
import { getValidSession } from "../lib/session";
import type {
  AnalyzeApplicationResult,
  AutofillData,
  ResolvedAnswer,
  ResolvedChoice,
  ScannedJobPosting,
  StoredSession,
  TailoredResumeFilePayload,
} from "../lib/types";

type BridgeMessage =
  | { type: "SESSION_UPDATE"; session: StoredSession }
  | { type: "SESSION_CLEARED" }
  | { type: "SCAN_JOB_POSTING"; posting: ScannedJobPosting }
  | { type: "GET_AUTOFILL_DATA" }
  | { type: "RESOLVE_QUESTION"; questionText: string }
  | { type: "RESOLVE_CHOICE"; questionText: string; options: string[] }
  | { type: "UPDATE_ANSWER"; answerId: string; answerText: string }
  | { type: "DELETE_ANSWER"; answerId: string }
  | { type: "GET_TAILORED_RESUME_FILE" }
  | { type: "GET_TAILORED_RESUME_URL" }
  | { type: "GET_COVER_LETTER_FILE" };

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function withSession<T>(fn: (accessToken: string) => Promise<T>): Promise<Result<T>> {
  const session = await getValidSession();
  if (!session) return { ok: false, error: "Not signed in - log into the FillRight website first." };
  try {
    return { ok: true, data: await fn(session.access_token) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function sendProgress(tabId: number, status: string, percent: number): void {
  chrome.tabs.sendMessage(tabId, { type: "SCAN_PROGRESS", tabId, status, percent }).catch(() => {
    // Tab may have navigated away or closed - nothing to do.
  });
}

function cap(s: string | null | undefined): string | null {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}

function sendJobAnalyzed(tabId: number, application: AnalyzeApplicationResult): void {
  const jd = application.jd_analysis;
  const loc = jd?.locations?.[0];
  const tags = [
    loc ? [loc.city, loc.state].filter(Boolean).join(", ") : null,
    cap(loc?.workplace_type),
    jd?.seniority,
    jd?.employment_type,
  ].filter((t): t is string => Boolean(t));
  // Required keywords first, mirroring getAutofillData's ordering.
  const keywords = [...(jd?.keywords ?? [])]
    .sort((a, b) => Number(b.required) - Number(a.required))
    .map((k) => k.term);
  chrome.tabs
    .sendMessage(tabId, {
      type: "JOB_ANALYZED",
      company: application.company,
      title: application.job_title ?? "",
      tags,
      salary: jd?.salary_range ?? null,
      keywords,
    })
    .catch(() => {});
}

async function handleScanJobPosting(posting: ScannedJobPosting, tabId: number): Promise<void> {
  const session = await getValidSession();
  if (!session) {
    sendProgress(tabId, "Not signed in - log into the FillRight website first.", 0);
    return;
  }

  try {
    sendProgress(tabId, "Analyzing job description...", 15);
    const application = await analyzeJobDescription(session.access_token, posting);
    sendJobAnalyzed(tabId, application);

    if (application.is_duplicate) {
      sendProgress(tabId, "Already scanned this posting before - reusing the cached analysis.", 40);
    }

    const resumeProfileId = await getDefaultResumeProfileId(session.access_token);
    if (!resumeProfileId) {
      sendProgress(tabId, "No resume on file - upload one on the FillRight website first.", 40);
      return;
    }

    // Cover letter generation only needs the cached JD analysis + base
    // resume, not the tailored output, so it doesn't need to wait on
    // tailoring to finish - running both at once cuts a real chunk off the
    // total wait instead of doing two LLM round-trips back to back.
    sendProgress(tabId, "Tailoring resume and writing your cover letter...", 45);
    await Promise.all([
      tailorResume(session.access_token, application.id, resumeProfileId),
      generateCoverLetter(session.access_token, application.id, resumeProfileId),
    ]);

    sendProgress(tabId, "Ready - resume tailored and cover letter generated.", 100);
  } catch (err) {
    sendProgress(tabId, `Error: ${err instanceof Error ? err.message : String(err)}`, 0);
  }
}

chrome.runtime.onMessage.addListener((message: BridgeMessage, sender, sendResponse) => {
  if (message.type === "SESSION_UPDATE") {
    chrome.storage.local.set({ session: message.session }).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "SESSION_CLEARED") {
    chrome.storage.local.remove("session").then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.type === "SCAN_JOB_POSTING") {
    const tabId = sender.tab?.id;
    if (tabId !== undefined) {
      void handleScanJobPosting(message.posting, tabId);
    }
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "GET_AUTOFILL_DATA") {
    void withSession<AutofillData>((token) => getAutofillData(token)).then(sendResponse);
    return true;
  }
  if (message.type === "RESOLVE_QUESTION") {
    void withSession<ResolvedAnswer>((token) => resolveQuestion(token, message.questionText)).then(sendResponse);
    return true;
  }
  if (message.type === "RESOLVE_CHOICE") {
    void withSession<ResolvedChoice>((token) => resolveChoice(token, message.questionText, message.options)).then(
      sendResponse,
    );
    return true;
  }
  if (message.type === "UPDATE_ANSWER") {
    void withSession((token) => updateAnswer(token, message.answerId, message.answerText)).then(sendResponse);
    return true;
  }
  if (message.type === "DELETE_ANSWER") {
    void withSession((token) => deleteAnswer(token, message.answerId)).then(sendResponse);
    return true;
  }
  if (message.type === "GET_TAILORED_RESUME_FILE") {
    void withSession<TailoredResumeFilePayload | null>((token) => getTailoredResumeFile(token)).then(sendResponse);
    return true;
  }
  if (message.type === "GET_TAILORED_RESUME_URL") {
    void withSession<string | null>((token) => getTailoredResumeUrl(token)).then(sendResponse);
    return true;
  }
  if (message.type === "GET_COVER_LETTER_FILE") {
    void withSession<TailoredResumeFilePayload | null>((token) => getCoverLetterFile(token)).then(sendResponse);
    return true;
  }
  return false;
});
