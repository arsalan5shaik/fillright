import { markField } from "./confidenceUi";
import { getAssociatedLabelText, isVisible } from "./formUtils";
import {
  isComboboxEmpty,
  isWorkdayComboboxTrigger,
  readComboboxOptions,
  selectComboboxOption,
} from "./workdayCombobox";

/** After the normal fill passes, any REQUIRED field FillRight still hasn't
 * answered would block submission. This pass fills those:
 *   - listbox dropdowns / radio groups: ask the AI to pick one of the field's
 *     ACTUAL options (backend /qa/resolve-choice), then select it.
 *   - sensitive/legal questions (EEO race/gender/veteran/disability, criminal
 *     history, etc.): NEVER an AI guess about the user's identity/legal status
 *     - pick a "Decline to answer" option if the field offers one, else leave
 *     it for the user. (User-chosen safety policy.)
 * Everything filled here is marked "please review"; FillRight never submits. */

const SENSITIVE_PATTERNS: RegExp[] = [
  /race|ethnicity|hispanic|latino/i,
  /gender|\bsex\b/i,
  /veteran/i,
  /disab(led|ility)/i,
  /sexual orientation|transgender/i,
  /\beeo\b|equal employment|self.?identif/i,
  /felon|conviction|convicted|criminal|background check/i,
];
const DECLINE_PATTERN = /decline|prefer not|do not wish|choose not/i;

export function isSensitive(text: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(text));
}

function isRequired(el: Element): boolean {
  if (el.getAttribute("aria-required") === "true") return true;
  if (el instanceof HTMLInputElement && el.required) return true;
  const label = getAssociatedLabelText(el as HTMLElement) ?? "";
  if (/\*\s*$/.test(label.trim())) return true;
  // Workday renders the required "*" as a sibling element within the field's
  // formField wrapper rather than in the label text.
  const wrapper = el.closest<HTMLElement>('[data-automation-id^="formField"]');
  return wrapper ? /(^|\s)\*(\s|$)/.test(wrapper.textContent ?? "") : false;
}

function sendMessage<T>(message: unknown): Promise<T> {
  return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
}

type ChoiceResponse = { ok: true; data: { answer: string | null } } | { ok: false; error: string } | undefined;

async function aiChoose(question: string, options: string[]): Promise<string | null> {
  const response = await sendMessage<ChoiceResponse>({ type: "RESOLVE_CHOICE", questionText: question, options });
  return response && response.ok ? response.data.answer : null;
}

async function fillRequiredComboboxes(): Promise<number> {
  let filled = 0;
  const comboboxes = Array.from(document.querySelectorAll<HTMLElement>("button")).filter(
    (b): b is HTMLButtonElement => isWorkdayComboboxTrigger(b) && isVisible(b) && isComboboxEmpty(b) && isRequired(b),
  );

  for (const button of comboboxes) {
    const label = getAssociatedLabelText(button) ?? button.getAttribute("aria-label") ?? "";
    const options = await readComboboxOptions(button);
    if (options.length === 0) continue;

    const target = isSensitive(label)
      ? (options.find((o) => DECLINE_PATTERN.test(o)) ?? null) // never AI-guess identity/legal
      : await aiChoose(label, options);
    if (!target) continue;

    if (await selectComboboxOption(button, [target], target)) {
      markField(button, "low");
      filled++;
    }
  }
  return filled;
}

function radioGroups(): HTMLInputElement[][] {
  const groups = new Map<string, HTMLInputElement[]>();
  for (const el of document.querySelectorAll<HTMLInputElement>('input[type="radio"]')) {
    if (!isVisible(el) || !el.name) continue;
    (groups.get(el.name) ?? groups.set(el.name, []).get(el.name)!).push(el);
  }
  return Array.from(groups.values());
}

function radioGroupQuestion(radio: HTMLInputElement): string | null {
  let container: HTMLElement | null = radio.closest('[role="radiogroup"]') ?? radio.closest("fieldset");
  for (let depth = 0; container && depth < 5; depth++, container = container.parentElement) {
    const legend = container.querySelector(":scope > legend, :scope > label");
    if (legend?.textContent?.trim()) return legend.textContent.trim();
    const labelledBy = container.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .filter(Boolean)
        .join(" ");
      if (text) return text;
    }
  }
  return null;
}

async function fillRequiredRadios(): Promise<number> {
  let filled = 0;
  for (const group of radioGroups()) {
    if (group.length === 0 || group.some((r) => r.checked)) continue;
    if (!group.some(isRequired)) continue;

    const question = radioGroupQuestion(group[0]);
    if (!question) continue;

    const byLabel = new Map<string, HTMLInputElement>();
    for (const r of group) {
      const l = getAssociatedLabelText(r)?.trim();
      if (l) byLabel.set(l, r);
    }
    const options = Array.from(byLabel.keys());
    if (options.length === 0) continue;

    const target = isSensitive(question)
      ? (options.find((o) => DECLINE_PATTERN.test(o)) ?? null)
      : await aiChoose(question, options);
    const radio = target ? byLabel.get(target) : undefined;
    if (!radio) continue;

    radio.click();
    markField(radio, "low");
    filled++;
  }
  return filled;
}

export async function runRequiredFieldFallback(): Promise<number> {
  const combos = await fillRequiredComboboxes();
  const radios = await fillRequiredRadios();
  return combos + radios;
}
