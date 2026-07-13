import { isVisible } from "./formUtils";

/** Workday's custom "prompt" combobox: a button[aria-haspopup="listbox"]
 * showing the current value (or a placeholder like "Select One") that,
 * when clicked, reveals a filter text input and renders a role="option"
 * listbox elsewhere in the DOM. Not a native <select>, so it's invisible to
 * setSelectValue - confirmed against a live Workday tenant (State field). */
export function isWorkdayComboboxTrigger(el: Element): el is HTMLButtonElement {
  return el instanceof HTMLButtonElement && el.getAttribute("aria-haspopup") === "listbox";
}

const PLACEHOLDER_TEXTS = new Set(["select one", ""]);

export function isComboboxEmpty(button: HTMLButtonElement): boolean {
  return PLACEHOLDER_TEXTS.has(button.textContent?.trim().toLowerCase() ?? "");
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

function typeIntoFilterInput(input: HTMLInputElement, text: string): void {
  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(input, text);
  } else {
    input.value = text;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function findFilterInput(button: HTMLButtonElement): HTMLInputElement | null {
  const input = button.parentElement?.querySelector<HTMLInputElement>('input[type="text"]');
  return input && isVisible(input) ? input : null;
}

function findVisibleOptionMatching(candidates: string[]): HTMLElement | null {
  const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).filter(isVisible);
  for (const candidate of candidates) {
    const target = candidate.trim().toLowerCase();
    const exact = options.find((opt) => opt.textContent?.trim().toLowerCase() === target);
    if (exact) return exact;
  }
  return null;
}

function waitFor<T>(check: () => T | null, timeoutMs: number, intervalMs = 100): Promise<T | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const result = check();
      if (result) {
        resolve(result);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(null);
        return;
      }
      setTimeout(tick, intervalMs);
    };
    tick();
  });
}

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO",
  montana: "MT", nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ",
  "new mexico": "NM", "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT",
  virginia: "VA", washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC",
};
const US_STATE_NAMES_BY_ABBREVIATION: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_ABBREVIATIONS).map(([name, abbr]) => [abbr.toLowerCase(), name]),
);

/** Tries the value as given, plus its state abbreviation <-> full-name
 * counterpart - the user's saved profile value and Workday's option text
 * aren't guaranteed to use the same form (e.g. "TX" vs "Texas"). */
function valueCandidates(value: string): string[] {
  const normalized = value.trim().toLowerCase();
  const candidates = [value];

  const abbreviation = US_STATE_ABBREVIATIONS[normalized];
  if (abbreviation) candidates.push(abbreviation);

  const fullName = US_STATE_NAMES_BY_ABBREVIATION[normalized];
  if (fullName) candidates.push(fullName);

  return candidates;
}

/** Opens the combobox, types into its filter input (Workday typically
 * virtualizes/filters long option lists like all 50 states rather than
 * rendering them all up front) to narrow it down, then clicks the matching
 * option. Best-effort against one real tenant's markup - relies only on
 * stable signals (aria-haspopup, role="option"), not Emotion-generated
 * classnames, but hasn't been verified across other tenants. */
export async function setWorkdayComboboxValue(button: HTMLButtonElement, value: string): Promise<boolean> {
  button.click();

  const candidates = valueCandidates(value);
  const filterInput = await waitFor(() => findFilterInput(button), 1000);
  if (filterInput) {
    typeIntoFilterInput(filterInput, candidates[0]);
  }

  const option = await waitFor(() => findVisibleOptionMatching(candidates), 1500);
  if (!option) {
    button.click(); // best-effort close so we don't leave the popup hanging open
    return false;
  }

  option.click();
  return true;
}
