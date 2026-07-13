import { markField } from "./confidenceUi";
import { matchFieldConcept, type FieldConcept } from "./fieldMap";
import {
  type FillableInput,
  getAssociatedLabelText,
  isFillableTextInput,
  isVisible,
  setFieldValue,
  setSelectValue,
} from "./formUtils";
import { isComboboxEmpty, isWorkdayComboboxTrigger, setWorkdayComboboxValue } from "./workdayCombobox";

export type ValueProvider = (concept: FieldConcept) => { value: string; confidence: "high" | "low" } | null;

export interface UnmatchedTextField {
  element: FillableInput;
  labelText: string;
}

export interface FillResult {
  filled: number;
  guessed: number;
  unmatched: number;
  // Text/textarea fields FillRight couldn't map to a known concept but that
  // do have a usable label - candidates for the Milestone 14 Q&A pass.
  // Selects are excluded: free-text generation can't answer "pick an
  // option" questions.
  unmatchedTextFields: UnmatchedTextField[];
}

/** Defensive guard, even though this module never dispatches clicks or
 * targets buttons by construction: never treat anything submit/button-shaped
 * as fillable. FillRight never auto-submits - only the user clicks Submit. */
function isSafeToTouch(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "button")) return false;
  return true;
}

export function runFillPass(getValue: ValueProvider): FillResult {
  const result: FillResult = { filled: 0, guessed: 0, unmatched: 0, unmatchedTextFields: [] };
  const candidates = document.querySelectorAll<HTMLElement>("input, select, textarea");

  for (const el of candidates) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement)) {
      continue;
    }
    if (!isSafeToTouch(el) || !isVisible(el)) continue;
    if (el instanceof HTMLSelectElement ? el.value !== "" : el.value.trim() !== "") continue; // don't clobber user's own edits

    const automationId = el.getAttribute("data-automation-id");
    const labelText = getAssociatedLabelText(el);
    const match = matchFieldConcept(automationId, labelText);

    const recordUnmatched = () => {
      result.unmatched++;
      if (isFillableTextInput(el) && labelText) {
        result.unmatchedTextFields.push({ element: el, labelText });
      }
    };

    if (!match) {
      recordUnmatched();
      continue;
    }

    const provided = getValue(match.concept);
    if (!provided) {
      recordUnmatched();
      continue;
    }

    const overallConfidence = match.matchConfidence === "high" && provided.confidence === "high" ? "high" : "low";

    if (isFillableTextInput(el)) {
      setFieldValue(el, provided.value);
      markField(el, overallConfidence);
      result[overallConfidence === "high" ? "filled" : "guessed"]++;
    } else if (el instanceof HTMLSelectElement) {
      const didSet = setSelectValue(el, provided.value);
      if (didSet) {
        markField(el, overallConfidence);
        result[overallConfidence === "high" ? "filled" : "guessed"]++;
      } else {
        result.unmatched++;
      }
    }
  }

  return result;
}

export interface ComboboxFillResult {
  filled: number;
  guessed: number;
}

/** Separate async pass for Workday's custom "prompt" combobox widgets
 * (button[aria-haspopup="listbox"] - see workdayCombobox.ts), run after the
 * main synchronous fill pass. Kept apart from runFillPass rather than
 * folded in: opening a popup and waiting for its options to render is
 * inherently async, and runFillPass's synchronous contract is relied on
 * elsewhere (and well covered by existing tests) as-is. */
export async function runComboboxFillPass(getValue: ValueProvider): Promise<ComboboxFillResult> {
  const result: ComboboxFillResult = { filled: 0, guessed: 0 };
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button")).filter(isWorkdayComboboxTrigger);

  for (const button of buttons) {
    if (!isVisible(button) || !isComboboxEmpty(button)) continue;

    const labelText = getAssociatedLabelText(button);
    const match = matchFieldConcept(button.getAttribute("data-automation-id"), labelText);
    if (!match) continue;

    const provided = getValue(match.concept);
    if (!provided) continue;

    const didSet = await setWorkdayComboboxValue(button, provided.value);
    if (!didSet) continue;

    const overallConfidence = match.matchConfidence === "high" && provided.confidence === "high" ? "high" : "low";
    markField(button, overallConfidence);
    result[overallConfidence === "high" ? "filled" : "guessed"]++;
  }

  return result;
}
