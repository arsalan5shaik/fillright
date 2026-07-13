import { markField } from "./confidenceUi";
import { getAssociatedLabelText, isVisible } from "./formUtils";

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
