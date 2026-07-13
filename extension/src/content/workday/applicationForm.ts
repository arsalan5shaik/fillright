import type { AutofillData, TailoredResumeFilePayload, WorkdayCredentials } from "../../lib/types";
import { fillAccountCreationFields, findAccountCreationFields } from "./accountCredentials";
import { answerConflictOfInterestQuestions } from "./booleanScreeningQuestions";
import { findCoverLetterFileInput, findResumeFileInput, injectFile } from "./fileAttach";
import { runComboboxFillPass, runFillPass } from "./fillEngine";
import { answerFirstOptionQuestions } from "./firstOptionQuestions";
import { runQaPass } from "./qaPass";
import { fillSkillsQuestion } from "./skillsQuestion";
import { showProgress, showStatus } from "./statusUi";
import { buildValueProvider } from "./valueProvider";

/** Not the job-posting page (no JobPosting JSON-LD, checked by the caller)
 * and either has enough form fields to plausibly be a wizard step, or has a
 * password field on its own - the latter catches Workday's lean sign-in/
 * create-account interstitial (sometimes just email + password, under the
 * field-count threshold) that appears right after clicking Apply.
 * Deliberately broad rather than guessing a specific URL path segment,
 * since the actual apply-flow URL pattern hasn't been verified against a
 * live tenant (see Milestone 13 notes). Runs harmlessly on the Review step
 * too - it just won't find any empty fields to fill there. */
export function looksLikeApplicationForm(): boolean {
  return document.querySelectorAll("input, select, textarea").length >= 3 || findAccountCreationFields() !== null;
}

type AutofillDataResponse = { ok: true; data: AutofillData } | { ok: false; error: string };
type TailoredResumeFileResponse = { ok: true; data: TailoredResumeFilePayload | null } | { ok: false; error: string };
type WorkdayCredentialsResponse = { ok: true; data: WorkdayCredentials } | { ok: false; error: string };

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

/** No-op if there's no file input on this step (most steps don't have one)
 * or the user already attached something themselves - never overwrites a
 * file they picked by hand, same "don't clobber user edits" rule the text
 * field fill pass follows. */
async function runResumeFileAttach(): Promise<string> {
  const input = findResumeFileInput();
  if (!input) return "";
  if (input.files && input.files.length > 0) return "";

  const response = await sendMessage<TailoredResumeFileResponse>({ type: "GET_TAILORED_RESUME_FILE" });
  if (!response || !response.ok || !response.data) return "";

  injectFile(input, response.data.blob, response.data.filename);
  return `Attached your tailored resume (${response.data.filename}).`;
}

/** Only acts when this step has a file input specifically labeled "cover
 * letter" (see fileAttach.ts) - if a tenant has no such dedicated slot, the
 * cover letter is never uploaded anywhere, and never substituted into the
 * resume slot. */
async function runCoverLetterFileAttach(): Promise<string> {
  const input = findCoverLetterFileInput();
  if (!input) return "";
  if (input.files && input.files.length > 0) return "";

  const response = await sendMessage<TailoredResumeFileResponse>({ type: "GET_COVER_LETTER_FILE" });
  if (!response || !response.ok || !response.data) return "";

  injectFile(input, response.data.blob, response.data.filename);
  return `Attached your cover letter (${response.data.filename}).`;
}

/** No-op unless this step has a password field (Workday's own
 * "create a candidate account" step for this tenant - see
 * accountCredentials.ts) and the user has saved credentials to fill it with. */
async function runAccountCredentialsFill(): Promise<string> {
  const response = await sendMessage<WorkdayCredentialsResponse>({ type: "GET_WORKDAY_CREDENTIALS" });
  if (!response || !response.ok || !response.data.email || !response.data.password) return "";

  const filled = fillAccountCreationFields(response.data.email, response.data.password);
  return filled ? "Filled your saved Workday account email/password. " : "";
}

export async function runApplicationFormFill(): Promise<void> {
  showProgress("Checking for a Workday account-creation step...", 5);
  const credentialsStatus = await runAccountCredentialsFill();

  showProgress(`${credentialsStatus}Filling application form...`, 15);

  const autofillResponse = await sendMessage<AutofillDataResponse>({ type: "GET_AUTOFILL_DATA" });
  if (!autofillResponse || !autofillResponse.ok) {
    showStatus(`Error: ${autofillResponse && !autofillResponse.ok ? autofillResponse.error : "unknown error"}`);
    return;
  }

  await answerFirstOptionQuestions();

  const getValue = buildValueProvider(autofillResponse.data);
  const result = runFillPass(getValue);
  const comboboxResult = await runComboboxFillPass(getValue);
  const conflictOfInterestAnswered = answerConflictOfInterestQuestions();

  const remainingForQa = result.unmatchedTextFields.filter(
    (field) => !fillSkillsQuestion(field, autofillResponse.data.jdKeywords),
  );
  const skillsAnswered = result.unmatchedTextFields.length - remainingForQa.length;

  const totalFilled = result.filled + comboboxResult.filled;
  const totalGuessed = result.guessed + comboboxResult.guessed;
  showProgress(
    `${credentialsStatus}Filled ${totalFilled} field(s) confidently, ${totalGuessed} guessed (please review), ` +
      `${conflictOfInterestAnswered} screening question(s) auto-answered "No" (please review), ` +
      `${skillsAnswered} skills question(s) filled from the job description's keywords (please review), ` +
      `checking ${remainingForQa.length} unmapped field(s) for saved/AI answers...`,
    55,
  );

  const [attempted, fileAttachStatus, coverLetterAttachStatus] = await Promise.all([
    runQaPass(remainingForQa),
    runResumeFileAttach(),
    runCoverLetterFileAttach(),
  ]);
  const stillUnfilled = result.unmatched - attempted - skillsAnswered;
  showProgress(
    `${credentialsStatus}Filled ${totalFilled} confidently, ${totalGuessed} guessed (please review), ` +
      `${attempted} answered via your answer bank/AI (please review), ` +
      `${Math.max(stillUnfilled, 0)} left for you to fill in. ${fileAttachStatus} ${coverLetterAttachStatus} ` +
      `Review everything before clicking Submit yourself - FillRight never submits for you.`,
    100,
  );
}
