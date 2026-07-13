import {
  analyzeJobDescription,
  deleteAnswer,
  generateCoverLetter,
  getAutofillData,
  getDefaultResumeProfileId,
  resolveQuestion,
  tailorResume,
  updateAnswer,
} from "../lib/apiClient";
import { getStoredSession } from "../lib/session";
import type { AutofillData, ResolvedAnswer, ScannedJobPosting, StoredSession } from "../lib/types";

type BridgeMessage =
  | { type: "SESSION_UPDATE"; session: StoredSession }
  | { type: "SESSION_CLEARED" }
  | { type: "SCAN_JOB_POSTING"; posting: ScannedJobPosting }
  | { type: "GET_AUTOFILL_DATA" }
  | { type: "RESOLVE_QUESTION"; questionText: string }
  | { type: "UPDATE_ANSWER"; answerId: string; answerText: string }
  | { type: "DELETE_ANSWER"; answerId: string };

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function withSession<T>(fn: (accessToken: string) => Promise<T>): Promise<Result<T>> {
  const session = await getStoredSession();
  if (!session) return { ok: false, error: "Not signed in - log into the FillRight website first." };
  try {
    return { ok: true, data: await fn(session.access_token) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function sendProgress(tabId: number, status: string): void {
  chrome.tabs.sendMessage(tabId, { type: "SCAN_PROGRESS", tabId, status }).catch(() => {
    // Tab may have navigated away or closed - nothing to do.
  });
}

async function handleScanJobPosting(posting: ScannedJobPosting, tabId: number): Promise<void> {
  const session = await getStoredSession();
  if (!session) {
    sendProgress(tabId, "Not signed in - log into the FillRight website first.");
    return;
  }

  try {
    sendProgress(tabId, "Analyzing job description...");
    const application = await analyzeJobDescription(session.access_token, posting);

    if (application.is_duplicate) {
      sendProgress(tabId, "Already scanned this posting before - reusing the cached analysis.");
    }

    const resumeProfileId = await getDefaultResumeProfileId(session.access_token);
    if (!resumeProfileId) {
      sendProgress(tabId, "No resume on file - upload one on the FillRight website first.");
      return;
    }

    sendProgress(tabId, "Tailoring resume...");
    await tailorResume(session.access_token, application.id, resumeProfileId);

    sendProgress(tabId, "Generating cover letter...");
    await generateCoverLetter(session.access_token, application.id, resumeProfileId);

    sendProgress(tabId, "Ready - resume tailored and cover letter generated.");
  } catch (err) {
    sendProgress(tabId, `Error: ${err instanceof Error ? err.message : String(err)}`);
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
  if (message.type === "UPDATE_ANSWER") {
    void withSession((token) => updateAnswer(token, message.answerId, message.answerText)).then(sendResponse);
    return true;
  }
  if (message.type === "DELETE_ANSWER") {
    void withSession((token) => deleteAnswer(token, message.answerId)).then(sendResponse);
    return true;
  }
  return false;
});
