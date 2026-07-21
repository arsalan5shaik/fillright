import { getAssociatedLabelText, isVisible } from "./formUtils";

/** Questions where the actual choice has no bearing on the application, so
 * there's no reason to route them through the answer-bank/AI resolver at
 * all - just take the first available option, drilling through however
 * many nested category levels Workday's hierarchical picker shows (e.g.
 * "How Did You Hear About Us?" -> "Advertising" -> "Advertising - Outdoor"). */
const AUTO_FIRST_OPTION_PATTERNS: RegExp[] = [/how did you hear/i, /how you heard/i];

export function isAutoFirstOptionQuestion(text: string): boolean {
  return AUTO_FIRST_OPTION_PATTERNS.some((pattern) => pattern.test(text));
}

// Workday renders "How Did You Hear About Us?" as a hierarchical *prompt*
// widget, not a plain text field: the option rows can be role="option" OR
// Workday's own promptOption/promptLeafNode automation-ids depending on
// tenant. Matching all of them is what lets the drill-through work across
// tenants (the previous input-only version never found the button-based
// widget at all, so the field was left blank - the user reported this
// repeatedly).
const OPTION_SELECTOR =
  '[role="option"], [data-automation-id="promptOption"], [data-automation-id="promptLeafNode"], [data-automation-id*="promptOption"]';

function findFirstVisibleOption(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(OPTION_SELECTOR)).find(isVisible) ?? null;
}

function menuIsOpen(): boolean {
  return findFirstVisibleOption() !== null;
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

/** Opens the widget's dropdown. A plain .click() wasn't reliably enough to
 * trigger it live (confirmed: the field was left empty and fell through to
 * the free-text answer-bank pass instead), so this also dispatches focus and
 * a mousedown/mouseup pair in case the widget listens for one of those
 * specifically rather than click. Works on both an <input> and a <button>/
 * prompt trigger. */
function openTrigger(el: HTMLElement): void {
  el.focus();
  el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  el.click();
}

/** Opens the widget's menu, trying several strategies because the HDYHAU
 * widget varies by tenant (a listbox button showing "Select One", an input, or
 * a prompt with a separate list icon that actually triggers the menu). Returns
 * true once option rows are visible. */
async function openWidget(trigger: HTMLElement, wrapper: HTMLElement | null): Promise<boolean> {
  openTrigger(trigger);
  if (await waitFor(findFirstVisibleOption, 800)) return true;

  // The trigger might be the display input while a sibling prompt icon is what
  // opens the hierarchical menu - click the other clickables in the wrapper.
  if (wrapper) {
    for (const el of Array.from(
      wrapper.querySelectorAll<HTMLElement>('button, [role="button"], [data-automation-id*="prompt"], svg'),
    )) {
      if (el === trigger || !isVisible(el)) continue;
      openTrigger(el);
      if (await waitFor(findFirstVisibleOption, 450)) return true;
    }
  }

  // Keyboard fallback: listbox comboboxes commonly open on ArrowDown/Enter.
  trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  if (await waitFor(findFirstVisibleOption, 400)) return true;
  trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  return !!(await waitFor(findFirstVisibleOption, 400));
}

/** Presses Escape to close a menu that stayed open (e.g. a multi-select
 * prompt that doesn't auto-collapse after a leaf pick), so it can't cover
 * the next field. */
function closeMenu(el: HTMLElement): void {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
}

/** True when this trigger has no selection yet, so we should answer it.
 * Inputs: an empty value. Prompt/button widgets: no "selected item" pill in
 * the field wrapper and a placeholder-looking trigger ("Select One"). */
function looksEmpty(trigger: HTMLElement, wrapper: HTMLElement | null): boolean {
  if (trigger instanceof HTMLInputElement || trigger instanceof HTMLTextAreaElement) {
    return trigger.value.trim() === "";
  }
  const scope = wrapper ?? trigger;
  const hasPill = scope.querySelector('[data-automation-id="selectedItem"], [data-automation-id="pill"]');
  if (hasPill) return false;
  const text = (trigger.textContent ?? "").trim().toLowerCase();
  return text === "" || /select one|select\.\.\.|select…|search|make a selection/.test(text);
}

/** Every plausible HDYHAU trigger on the page, de-duplicated. Covers three
 * shapes: (1) the field wrapper whose label matches - the trigger is the
 * button/combobox/input inside it (the button-based prompt case that the old
 * input-only scan missed); (2) any labelled combobox button directly; and
 * (3) labelled text/search inputs (the simple tenants + the unit tests). */
function findTriggers(): { trigger: HTMLElement; wrapper: HTMLElement | null }[] {
  const found: { trigger: HTMLElement; wrapper: HTMLElement | null }[] = [];
  const seen = new Set<HTMLElement>();
  const add = (trigger: HTMLElement | null, wrapper: HTMLElement | null) => {
    if (!trigger || seen.has(trigger) || !isVisible(trigger)) return;
    if (!looksEmpty(trigger, wrapper)) return;
    seen.add(trigger);
    found.push({ trigger, wrapper });
  };

  for (const wrapper of document.querySelectorAll<HTMLElement>('[data-automation-id^="formField-"]')) {
    const label = getAssociatedLabelText(wrapper) ?? wrapper.textContent ?? "";
    if (!isAutoFirstOptionQuestion(label)) continue;
    const inner = wrapper.querySelector<HTMLElement>(
      'button[aria-haspopup], [aria-haspopup="listbox"], [role="combobox"], input, button',
    );
    add(inner ?? wrapper, wrapper);
  }

  for (const el of document.querySelectorAll<HTMLElement>(
    'input[type="text"], input[type="search"], input:not([type]), button[aria-haspopup], [aria-haspopup="listbox"], [role="combobox"]',
  )) {
    const label = getAssociatedLabelText(el);
    if (label && isAutoFirstOptionQuestion(label)) add(el, el.closest('[data-automation-id^="formField-"]'));
  }

  return found;
}

/** Finds HDYHAU-style fields and clicks through their dropdown, always taking
 * the first option at every level, until no further options appear (selection
 * committed) or a safety cap is hit. Run before the main fill pass so the
 * field is already non-empty by the time it would otherwise be collected as
 * an "unmatched" candidate for the answer-bank/AI pass. Only counts as
 * "answered" if an option was actually clicked. */
export async function answerFirstOptionQuestions(): Promise<number> {
  let answered = 0;

  for (const { trigger, wrapper } of findTriggers()) {
    // Retry the whole open+drill: a single open doesn't always render the
    // option list, which used to leave the field blank.
    let committed = false;
    for (let attempt = 0; attempt < 2 && !committed; attempt++) {
      const opened = await openWidget(trigger, wrapper);
      if (!opened) {
        trigger.blur();
        await waitFor(() => (menuIsOpen() ? null : true), 250);
        continue;
      }

      // Drill through nested category levels, taking the first option each
      // time. Track every option's TEXT we've already clicked (not element
      // identity - Workday re-renders the list) so we stop instead of
      // re-clicking the same leaf or looping back to a category we already
      // drilled from once a multi-select prompt resets to the top.
      const seenTexts = new Set<string>();
      let clicked = false;
      for (let depth = 0; depth < 8; depth++) {
        const option = await waitFor(findFirstVisibleOption, 500);
        const text = option?.textContent?.trim() ?? null;
        if (!option || !text || seenTexts.has(text)) break;
        option.click();
        seenTexts.add(text);
        clicked = true;
      }

      // Committed when we clicked something and the option list has closed
      // (a leaf selection collapses the menu).
      if (clicked) {
        const stillOpen = await waitFor(() => (menuIsOpen() ? true : null), 400);
        if (stillOpen) closeMenu(trigger);
        committed = true;
      }
      if (!committed) {
        trigger.blur();
        await waitFor(() => (menuIsOpen() ? null : true), 300);
      }
    }

    if (committed) answered++;
  }

  return answered;
}
