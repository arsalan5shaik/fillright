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

function firstVisibleOption(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(isVisible) ?? null;
}

/** Types character-by-character (keydown + native value set + input + keyup).
 * Typeahead comboboxes fetch their options in response to real input events,
 * so a one-shot value set often doesn't trigger the search. */
function simulateTyping(input: HTMLInputElement, text: string): void {
  input.focus();
  let acc = "";
  for (const ch of text) {
    acc += ch;
    const init: KeyboardEventInit = { key: ch, bubbles: true };
    input.dispatchEvent(new KeyboardEvent("keydown", init));
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(input, acc);
    } else {
      input.value = acc;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", init));
  }
}

function findVisibleOptionMatching(candidates: string[]): HTMLElement | null {
  const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).filter(isVisible);
  const normalized = candidates.map((c) => c.trim().toLowerCase()).filter(Boolean);

  // Exact match wins (so "Texas" never gets shadowed by a broader startsWith
  // hit)...
  for (const target of normalized) {
    const exact = options.find((opt) => opt.textContent?.trim().toLowerCase() === target);
    if (exact) return exact;
  }
  // ...then a prefix match for reasonably-specific candidates, so a résumé's
  // "Bachelor" lands on the option "Bachelor's Degree" / "Bachelor of Science"
  // even though the exact option text isn't known ahead of time. Kept to
  // candidates >= 4 chars so a short token can't match half the list.
  for (const target of normalized) {
    if (target.length < 4) continue;
    const prefix = options.find((opt) => opt.textContent?.trim().toLowerCase().startsWith(target));
    if (prefix) return prefix;
  }
  // ...then a contains match, but only for multi-word candidates so a short
  // token can't match unrelated options. Confirmed needed live: a Workday
  // degree option reads "B.S. - Bachelor of Science", which neither an exact
  // nor a prefix match on "Bachelor of Science" catches, but a contains does.
  for (const target of normalized) {
    if (!target.includes(" ")) continue;
    const contains = options.find((opt) => opt.textContent?.trim().toLowerCase().includes(target));
    if (contains) return contains;
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

/** Opens the combobox, types `filterTerm` into its filter input (Workday
 * typically virtualizes/filters long option lists rather than rendering them
 * all up front) to narrow the list, then clicks the first option matching any
 * of `candidates`. `filterTerm` is separate from `candidates` because the
 * value to type to *narrow* the list (e.g. "Bachelor") is often broader than
 * the exact option we want to *pick* ("Bachelor of Science"). Best-effort
 * against known Workday markup (aria-haspopup, role="option"), not verified
 * across all tenants. */
export async function selectComboboxOption(
  button: HTMLButtonElement,
  candidates: string[],
  filterTerm: string,
): Promise<boolean> {
  // Verify-and-retry ("triple check"): a single open+click sometimes doesn't
  // register (option rendered late, click landed mid-reflow), leaving the
  // trigger on "Select One" and the required field erroring. Retry up to 3x,
  // confirming each time that the trigger's value actually changed.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!isComboboxEmpty(button)) return true; // already selected (idempotent / committed by a prior try)

    button.click(); // open
    const filterInput = await waitFor(() => findFilterInput(button), 1000);
    if (filterInput) {
      typeIntoFilterInput(filterInput, filterTerm);
    }

    const option = await waitFor(() => findVisibleOptionMatching(candidates), 1500);
    if (option) {
      option.click();
      const committed = await waitFor(() => (!isComboboxEmpty(button) ? true : null), 700);
      if (committed) return true;
    }

    // This attempt didn't commit - close any open popup so the next attempt's
    // click opens a fresh one rather than toggling it shut.
    if (findFilterInput(button)) button.click();
    await waitFor(() => (findFilterInput(button) ? null : true), 300);
  }
  return false;
}

/** Opens a listbox combobox, reads its option texts, then closes it again -
 * used by the required-field AI fallback to learn a dropdown's actual options
 * before asking the model to pick one. */
export async function readComboboxOptions(button: HTMLButtonElement): Promise<string[]> {
  button.click(); // open
  await waitFor(() => (firstVisibleOption() ? true : null), 1500);
  const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
    .filter(isVisible)
    .map((o) => o.textContent?.trim() ?? "")
    .filter(Boolean);
  if (findFilterInput(button)) button.click(); // close so the caller can re-open cleanly
  await waitFor(() => (findFilterInput(button) ? null : true), 300);
  return options;
}

/** Typeahead combobox: an <input> where you type a query, Workday fetches
 * matching role="option"s, and you pick one - distinct from the listbox
 * combobox (button trigger). Used for School / Field of Study ("type and
 * press enter to search"). Types the value, waits for a matching option,
 * else takes the top result (typeaheads rank the closest match first). */
export async function fillTypeaheadCombobox(input: HTMLInputElement, value: string): Promise<boolean> {
  if (!isVisible(input) || input.value.trim() !== "") return false;
  simulateTyping(input, value);
  const matched = await waitFor(() => findVisibleOptionMatching([value]), 2500);
  if (matched) {
    matched.click();
    return true;
  }
  const first = firstVisibleOption();
  if (first) {
    first.click();
    return true;
  }
  return false;
}

/** State/region convenience wrapper: expands "TX" ↔ "Texas" and types the
 * value itself as the filter term (the exact option is what we want to pick
 * and also narrows correctly). */
export async function setWorkdayComboboxValue(button: HTMLButtonElement, value: string): Promise<boolean> {
  const candidates = valueCandidates(value);
  return selectComboboxOption(button, candidates, value);
}

/** Finds a Workday combobox trigger inside `scope` whose associated label
 * matches `labelPattern` and is still empty ("Select One") - used to fill a
 * combobox that lives inside a specific repeatable-section panel (e.g. the
 * Degree picker within one Education entry) without touching an identically-
 * labelled combobox in a sibling panel. */
export function findScopedComboboxTrigger(
  scope: HTMLElement,
  labelPattern: RegExp,
  getLabel: (el: HTMLElement) => string | null,
): HTMLButtonElement | null {
  return (
    Array.from(scope.querySelectorAll<HTMLElement>("button")).find(
      (el): el is HTMLButtonElement =>
        isWorkdayComboboxTrigger(el) && isVisible(el) && isComboboxEmpty(el) && labelPattern.test(getLabel(el) ?? ""),
    ) ?? null
  );
}
