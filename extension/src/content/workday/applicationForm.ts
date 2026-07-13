import type { AutofillData, TailoredResumeFilePayload } from "../../lib/types";
import { checkAccountCreationConsent, hasAccountCreationStep } from "./accountCredentials";
import { answerConflictOfInterestQuestions } from "./booleanScreeningQuestions";
import { findCoverLetterFileInput, findResumeFileInput, injectFile } from "./fileAttach";
import { runComboboxFillPass, runFillPass, type ValueProvider } from "./fillEngine";
import { answerFirstOptionQuestions } from "./firstOptionQuestions";
import { runQaPass } from "./qaPass";
import { fillEducationSection, fillWebsitesSection, fillWorkExperienceSection, type WebsiteEntry } from "./repeatableSections";
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
  return document.querySelectorAll("input, select, textarea").length >= 3 || hasAccountCreationStep();
}

type AutofillDataResponse = { ok: true; data: AutofillData } | { ok: false; error: string };
type TailoredResumeFileResponse = { ok: true; data: TailoredResumeFilePayload | null } | { ok: false; error: string };

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

/** Email/password on Workday's account-creation step are no longer
 * autofilled - Workday's invisible-reCAPTCHA-style click_filter/
 * noCaptchaWrapper on the Create Account button never accepted
 * programmatically-set values as genuine, confirmed live even after
 * switching to per-character keystroke simulation. The user types those
 * two fields by hand; the consent checkbox isn't gated the same way, so
 * that's still checked automatically. */
function runAccountCreationConsent(): string {
  return checkAccountCreationConsent() ? "Checked the account-creation consent box. " : "";
}

export async function runApplicationFormFill(): Promise<void> {
  showProgress("Checking for a Workday account-creation step...", 5);
  const credentialsStatus = runAccountCreationConsent();

  showProgress(`${credentialsStatus}Filling application form...`, 15);

  const autofillResponse = await sendMessage<AutofillDataResponse>({ type: "GET_AUTOFILL_DATA" });
  if (!autofillResponse || !autofillResponse.ok) {
    showStatus(`Error: ${autofillResponse && !autofillResponse.ok ? autofillResponse.error : "unknown error"}`);
    return;
  }

  await answerFirstOptionQuestions();

  const websiteEntries: WebsiteEntry[] = (
    [
      { label: "LinkedIn", url: autofillResponse.data.profileFields.linkedin_url },
      { label: "Portfolio", url: autofillResponse.data.profileFields.portfolio_url },
      { label: "GitHub", url: autofillResponse.data.profileFields.github_url },
    ] as { label: string; url: string | undefined }[]
  ).filter((entry): entry is WebsiteEntry => Boolean(entry.url));

  const [workExperienceFilled, educationFilled, websitesFilled] = await Promise.all([
    fillWorkExperienceSection(autofillResponse.data.workExperience),
    fillEducationSection(autofillResponse.data.education),
    fillWebsitesSection(websiteEntries),
  ]);

  // On the account-creation step, the generic "email" concept (sourced from
  // the resume's contact info for the My Information step) would otherwise
  // still fill this page's email field via the ordinary fill pass, even
  // though the account-creation email/password are meant to be typed by
  // hand - a step with a password field is never the My Information step,
  // so suppressing "email" here can't affect the real contact-email field.
  const rawGetValue = buildValueProvider(autofillResponse.data);
  const onAccountCreationStep = hasAccountCreationStep();
  const getValue: ValueProvider = onAccountCreationStep
    ? (concept) => (concept === "email" ? null : rawGetValue(concept))
    : rawGetValue;

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
      `${workExperienceFilled} work experience / ${educationFilled} education / ${websitesFilled} website entries added, ` +
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
