import type { AutofillData, TailoredResumeFilePayload } from "../../lib/types";
import { checkAccountCreationConsent, hasAccountCreationStep, isAuthStep } from "./accountCredentials";
import { answerConflictOfInterestQuestions } from "./booleanScreeningQuestions";
import { findCoverLetterFileInput, findResumeFileInput, injectFile } from "./fileAttach";
import { runComboboxFillPass, runFillPass, type ValueProvider } from "./fillEngine";
import { answerFirstOptionQuestions, isAutoFirstOptionQuestion } from "./firstOptionQuestions";
import { runQaPass } from "./qaPass";
import { fillEducationSection, fillWebsitesSection, fillWorkExperienceSection, type WebsiteEntry } from "./repeatableSections";
import { runRequiredFieldFallback } from "./requiredFields";
import { fillSkillsQuestion } from "./skillsQuestion";
import { showProgress, showStatus } from "./statusUi";
import { buildValueProvider } from "./valueProvider";

/** Not the job-posting page (no JobPosting JSON-LD, checked by the caller)
 * and either has enough form fields to plausibly be a wizard step, has a
 * password field on its own (Workday's lean sign-in/create-account
 * interstitial, sometimes just email + password, under the field-count
 * threshold), or has an Add-gated repeatable section (My Experience can
 * have zero actual <input>/<select>/<textarea> elements anywhere on the
 * page - Work Experience/Education/Websites are entirely behind "Add"
 * buttons until clicked - confirmed live: this step was being treated as
 * "not an application form" and skipped entirely, so the Add-button
 * clicking logic never even got a chance to run). Deliberately broad
 * rather than guessing a specific URL path segment, since the actual
 * apply-flow URL pattern hasn't been verified against a live tenant (see
 * Milestone 13 notes). Runs harmlessly on the Review step too - it just
 * won't find any empty fields to fill there. */
export function looksLikeApplicationForm(): boolean {
  return (
    document.querySelectorAll("input, select, textarea").length >= 3 ||
    hasAccountCreationStep() ||
    document.querySelector('[data-automation-id="add-button"]') !== null
  );
}

/** Strict "are we inside Workday's application wizard" check, distinct from
 * the looser looksLikeApplicationForm() above. Workday wraps every apply-flow
 * step in an element whose data-automation-id starts with "applyFlow"
 * (confirmed live: applyFlowMyExpPage) - that wrapper exists on the wizard
 * steps but NOT on a job-posting page, so unlike a raw field-count it can't
 * be tripped by a posting page's incidental search/job-alert fields. The
 * add-button (repeatable sections) and a password field (the create-account
 * step) are kept as backups in case a tenant's wrapper id differs. This is
 * the gate for auto-filling on every step: as long as we're inside the
 * flow, each new step fills without the user re-clicking Start. */
export function isWizardStep(): boolean {
  return (
    document.querySelector('[data-automation-id^="applyFlow"]') !== null ||
    document.querySelector('[data-automation-id="add-button"]') !== null ||
    isAuthStep()
  );
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

export async function runApplicationFormFill(): Promise<void> {
  // Create-account / sign-in step: stay almost entirely hands-off. There is
  // nothing here for FillRight to fill - email/password are user-typed - and
  // running the full fill pass (repeatable-section polling, combobox/date
  // probing, MutationObserver churn, dispatched events) degrades the
  // reCAPTCHA score behind Workday's click_filter/noCaptchaWrapper overlay on
  // the Create Account button, which then silently refuses to submit.
  // Confirmed regression: the button worked until the fill pass was widened
  // to run on this step. The only automated touch is best-effort ticking the
  // consent box (a plain checkbox click, not reCAPTCHA-gated).
  if (isAuthStep()) {
    const consent = checkAccountCreationConsent();
    showStatus(
      `${consent ? "Checked the consent box. " : ""}Enter your email and password, then click ` +
        `Create Account / Sign In yourself.`,
    );
    return;
  }

  showProgress("Filling application form...", 15);

  const autofillResponse = await sendMessage<AutofillDataResponse>({ type: "GET_AUTOFILL_DATA" });
  if (!autofillResponse || !autofillResponse.ok) {
    showStatus(`Error: ${autofillResponse && !autofillResponse.ok ? autofillResponse.error : "unknown error"}`);
    return;
  }

  await answerFirstOptionQuestions();

  const seenUrls = new Set<string>();
  const websiteEntries: WebsiteEntry[] = (
    [
      { label: "LinkedIn", url: autofillResponse.data.profileFields.linkedin_url },
      { label: "Portfolio", url: autofillResponse.data.profileFields.portfolio_url },
      { label: "GitHub", url: autofillResponse.data.profileFields.github_url },
    ] as { label: string; url: string | undefined }[]
  ).filter((entry): entry is WebsiteEntry => {
    // De-duplicate by URL: users commonly put the same link (e.g. LinkedIn) in
    // more than one profile field, which previously filled the same URL into
    // multiple Website slots.
    const url = entry.url?.trim().toLowerCase();
    if (!url || seenUrls.has(url)) return false;
    seenUrls.add(url);
    return true;
  });

  // Sequential, not Promise.all - each of these clicks a button and waits
  // out a re-render on the same page; running them concurrently risked one
  // section's re-render interfering with another's in-flight DOM lookups.
  const workExperienceFilled = await fillWorkExperienceSection(autofillResponse.data.workExperience);
  const educationFilled = await fillEducationSection(autofillResponse.data.education);
  const websitesFilled = await fillWebsitesSection(websiteEntries);

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

  // Excludes a "how did you hear about us"-style field from the free-text
  // pass even if answerFirstOptionQuestions() failed to click through it -
  // typing free text into what's actually a category picker is wrong
  // regardless of whether the click-through succeeded, so worst case this
  // field is just left blank rather than getting the wrong kind of answer.
  const remainingForQa = result.unmatchedTextFields.filter(
    (field) =>
      !isAutoFirstOptionQuestion(field.labelText) &&
      !fillSkillsQuestion(field, autofillResponse.data.resumeSkills, autofillResponse.data.jdKeywords),
  );
  const skillsAnswered = result.unmatchedTextFields.length - remainingForQa.length;

  const totalFilled = result.filled + comboboxResult.filled;
  const totalGuessed = result.guessed + comboboxResult.guessed;
  showProgress(
    `Filled ${totalFilled} field(s) confidently, ${totalGuessed} guessed (please review), ` +
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

  // Last: any REQUIRED dropdown/radio still empty gets an AI-chosen answer
  // from its own options (sensitive/legal questions get a safe decline/skip),
  // so a required field never blocks submission. Marked "please review".
  const requiredFilled = await runRequiredFieldFallback();

  const stillUnfilled = result.unmatched - attempted - skillsAnswered - requiredFilled;
  showProgress(
    `Filled ${totalFilled} confidently, ${totalGuessed} guessed (please review), ` +
      `${attempted} answered via your answer bank/AI, ${requiredFilled} required field(s) AI-answered (please review), ` +
      `${Math.max(stillUnfilled, 0)} left for you to fill in. ${fileAttachStatus} ${coverLetterAttachStatus} ` +
      `Review everything before clicking Submit yourself - FillRight never submits for you.`,
    100,
  );
}
