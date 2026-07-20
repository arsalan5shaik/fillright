import { getAssociatedLabelText, isVisible } from "./formUtils";

/** Questions where the actual choice has no bearing on the application, so
 * there's no reason to route them through the answer-bank/AI resolver at
 * all - just take the first available option, drilling through however
 * many nested category levels Workday's hierarchical picker shows (e.g.
 * "How Did You Hear About Us?" -> "Advertising" -> "Advertising - Outdoor"). */
const AUTO_FIRST_OPTION_PATTERNS: RegExp[] = [/how did you hear about us/i];

export function isAutoFirstOptionQuestion(text: string): boolean {
  return AUTO_FIRST_OPTION_PATTERNS.some((pattern) => pattern.test(text));
}

function findFirstVisibleOption(): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(isVisible) ?? null;
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

/** Opens the dropdown - a plain .click() wasn't reliably enough to trigger
 * it live (confirmed: the field was left empty and fell through to the
 * free-text answer-bank pass instead), so this also dispatches focus and a
 * mousedown/mouseup pair in case the widget listens for one of those
 * specifically rather than click. */
function openDropdown(input: HTMLInputElement): void {
  input.focus();
  input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  input.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  input.click();
}

/** Finds empty text/search fields matching one of AUTO_FIRST_OPTION_PATTERNS
 * and clicks through their dropdown, always taking the first option at
 * every level, until no further options appear (selection committed) or a
 * safety depth cap is hit. Run before the main fill pass so the field is
 * already non-empty by the time it would otherwise be collected as an
 * "unmatched" candidate for the answer-bank/AI pass. Only counts as
 * "answered" if an option was actually clicked - the caller still excludes
 * a matched field from the free-text pass even when this fails to open
 * anything, since typing free text into a category picker is wrong
 * regardless of whether the first-option click succeeded. */
export async function answerFirstOptionQuestions(): Promise<number> {
  let answered = 0;

  const candidates = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="search"], input:not([type])'),
  ).filter((el) => isVisible(el) && el.value.trim() === "");

  for (const input of candidates) {
    const label = getAssociatedLabelText(input);
    if (!label || !isAutoFirstOptionQuestion(label)) continue;

    // Retry the whole open+drill: a single open doesn't always render the
    // option list, which used to leave the field blank (and it would then
    // wrongly fall through to the free-text pass).
    let committed = false;
    for (let attempt = 0; attempt < 2 && !committed; attempt++) {
      openDropdown(input);

      // Drill through nested category levels, taking the first option each
      // time. Track the last option's TEXT (not element identity - Workday
      // re-renders the list) so we stop instead of re-clicking the same leaf.
      let lastText: string | null = null;
      let clicked = false;
      for (let depth = 0; depth < 6; depth++) {
        const option = await waitFor(findFirstVisibleOption, depth === 0 ? 1500 : 500);
        const text = option?.textContent?.trim() ?? null;
        if (!option || text === lastText) break;
        option.click();
        lastText = text;
        clicked = true;
      }

      // Committed when we clicked something and the option list has closed
      // (a leaf selection collapses the menu).
      if (clicked) {
        const stillOpen = await waitFor(() => (findFirstVisibleOption() ? true : null), 400);
        committed = !stillOpen;
      }
      if (!committed) {
        input.blur();
        await waitFor(() => (findFirstVisibleOption() ? null : true), 300);
      }
    }

    if (committed) answered++;
  }

  return answered;
}
