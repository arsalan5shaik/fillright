import { markField } from "./confidenceUi";
import { getAssociatedLabelText, isVisible } from "./formUtils";
import { isComboboxEmpty, isWorkdayComboboxTrigger, selectComboboxOption } from "./workdayCombobox";

/** Common Workday screening questions that are near-universally "No" for a
 * given applicant, regardless of which company is asking - conflict-of-
 * interest / prior-employment / relative-at-the-company style questions.
 * Matched against the question text, not any specific company name, since
 * the hiring company differs per posting. */
const AUTO_NO_PATTERNS: RegExp[] = [
  /have you (ever )?(previously )?(been )?(employed by|worked (for|at)|an employee (of|at))/i,
  /(relative|family member).{0,80}(employ|work)/i,
  /(employ|work).{0,80}(relative|family member)/i,
  /government official/i,
  /conflict of interest/i,
];

function isAutoNoQuestion(text: string): boolean {
  return AUTO_NO_PATTERNS.some((pattern) => pattern.test(text));
}

/** Standard application screening questions with a safe, near-universal default
 * answer, applied to whichever widget presents them (a Yes/No radio group OR a
 * "Select One" listbox combobox) when FillRight has no saved answer for them.
 * Saved answers are filled earlier (leaving the field non-empty), so those are
 * skipped here. The user can override any of these on the website. Order
 * matters - first matching pattern wins. */
const SCREENING_DEFAULTS: { pattern: RegExp; answer: "Yes" | "No" }[] = [
  { pattern: /legally authorized to work|authorized to work in|work authorization|eligible to work/i, answer: "Yes" },
  {
    pattern: /require (visa |work )?sponsorship|need sponsorship|sponsorship (now|in the future|to work)|will you (now or in the future )?(require|need)/i,
    answer: "No",
  },
  { pattern: /over the age of 18|at least 18 years|are you 18/i, answer: "Yes" },
  {
    pattern: /interviewed with (us|our|this|the) (company|organization|team|firm)|previously interviewed/i,
    answer: "No",
  },
  {
    pattern: /worked (with|for|at) (us|this|our)[^?]{0,25}before|worked (here|with us) before|previously (worked|been employed)/i,
    answer: "No",
  },
  // Family/friends at the company or other conflict of interest.
  {
    pattern: /(family|friends|relative)[^?]{0,80}(work|employ)|do you have any[^?]{0,40}(family|friends|relatives)|conflict of interest/i,
    answer: "No",
  },
  // Current/former government or military employee.
  { pattern: /(current or former|are you a)[^?]{0,30}(government|military)[^?]{0,20}(employee|official)?/i, answer: "No" },
  // Pre-employment drug/alcohol test - positive or refused (DOT-style).
  { pattern: /tested positive[^?]{0,80}(drug|alcohol|test)|refused to test/i, answer: "No" },
  // Prior-employment / relatives / government / conflict-of-interest (the No set above).
  ...AUTO_NO_PATTERNS.map((pattern) => ({ pattern, answer: "No" as const })),
  {
    pattern: /(willing|able|agree|consent) to[^?]{0,30}background check|background check[^?]{0,20}(required|consent|willing)/i,
    answer: "Yes",
  },
  // Attestation/confirmation that the supplied answers are correct.
  {
    pattern: /I (confirm|certify|acknowledge|agree|attest|declare)|answers[^?]{0,50}(correct|accurate|up to date|complete|true)|certify that/i,
    answer: "Yes",
  },
];

function screeningDefaultFor(text: string): "Yes" | "No" | null {
  return SCREENING_DEFAULTS.find((d) => d.pattern.test(text))?.answer ?? null;
}

function groupRadiosByName(): HTMLInputElement[][] {
  const groups = new Map<string, HTMLInputElement[]>();
  for (const el of document.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    if (!isVisible(el) || !el.name) continue;
    const list = groups.get(el.name) ?? [];
    list.push(el);
    groups.set(el.name, list);
  }
  return Array.from(groups.values());
}

/** The question text for a radio group is a different thing from any single
 * option's own label ("Yes"/"No") - this looks for it via the group's own
 * accessible name (aria-label/aria-labelledby, fieldset/legend) rather than
 * scraping arbitrary nearby text, since guessing the wrong text here would
 * mean answering an unrelated question "No" by mistake. Deliberately
 * conservative: returns null (skip, don't guess) rather than a fallback
 * heuristic, since this hasn't been verified against live Workday HTML. */
function getRadioGroupQuestionText(first: HTMLInputElement): string | null {
  let container: HTMLElement | null = first.closest('[role="radiogroup"]') ?? first.closest("fieldset");
  if (!container) container = first.parentElement;

  for (let depth = 0; container && depth < 5; depth++, container = container.parentElement) {
    const ariaLabel = container.getAttribute("aria-label");
    if (ariaLabel?.trim()) return ariaLabel.trim();

    const labelledBy = container.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }

    const legend = container.querySelector(":scope > legend, :scope > label");
    if (legend?.textContent?.trim()) return legend.textContent.trim();
  }

  return null;
}

function findNoOption(group: HTMLInputElement[]): HTMLInputElement | null {
  return group.find((input) => /^no$/i.test(getAssociatedLabelText(input)?.trim() ?? "")) ?? null;
}

/** Auto-answers "No" on conflict-of-interest-style Yes/No screening
 * questions (prior employment at the hiring company, relatives employed
 * there, government-official status) - never overrides a group the user
 * already answered themselves. Marked as a guess (please-review outline)
 * since the question-text match is a heuristic, not a certainty. */
export function answerConflictOfInterestQuestions(): number {
  let answered = 0;

  for (const group of groupRadiosByName()) {
    if (group.length === 0 || group.some((input) => input.checked)) continue;

    const questionText = getRadioGroupQuestionText(group[0]);
    if (!questionText || !isAutoNoQuestion(questionText)) continue;

    const noOption = findNoOption(group);
    if (!noOption) continue;

    noOption.click();
    markField(noOption, "low");
    answered++;
  }

  return answered;
}

function findOptionByLabel(group: HTMLInputElement[], answer: "Yes" | "No"): HTMLInputElement | null {
  const want = new RegExp(`^${answer}$`, "i");
  return group.find((input) => want.test(getAssociatedLabelText(input)?.trim() ?? "")) ?? null;
}

/** Answers the standard application-screening questions (work authorization,
 * sponsorship, over-18, previously interviewed/employed, background-check
 * consent, conflict-of-interest) with their safe defaults - whether the site
 * renders each one as a Yes/No radio group OR a "Select One" listbox combobox.
 * This is what makes the "Application Questions" step (all dropdowns) actually
 * get filled. Never overrides a field the user (or an earlier saved-answer
 * pass) already set; everything is marked "please review". */
export async function answerScreeningQuestions(): Promise<number> {
  let answered = 0;

  // Yes/No radio groups.
  for (const group of groupRadiosByName()) {
    if (group.length === 0 || group.some((input) => input.checked)) continue;
    const questionText = getRadioGroupQuestionText(group[0]);
    if (!questionText) continue;
    const answer = screeningDefaultFor(questionText);
    if (!answer) continue;
    const option = findOptionByLabel(group, answer);
    if (!option) continue;
    option.click();
    markField(option, "low");
    answered++;
  }

  // "Select One" listbox comboboxes (the Application Questions step is entirely
  // these). Only touches still-empty ones, so a saved answer filled earlier is
  // left alone.
  const comboboxes = Array.from(document.querySelectorAll<HTMLElement>("button")).filter(
    (b): b is HTMLButtonElement => isWorkdayComboboxTrigger(b) && isVisible(b) && isComboboxEmpty(b),
  );
  for (const button of comboboxes) {
    const label = getAssociatedLabelText(button) ?? button.getAttribute("aria-label") ?? "";
    const answer = screeningDefaultFor(label);
    if (!answer) continue;
    if (await selectComboboxOption(button, [answer], answer)) {
      markField(button, "low");
      answered++;
    }
  }

  return answered;
}
