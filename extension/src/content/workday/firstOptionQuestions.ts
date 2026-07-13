import { getAssociatedLabelText, isVisible } from "./formUtils";

/** Questions where the actual choice has no bearing on the application, so
 * there's no reason to route them through the answer-bank/AI resolver at
 * all - just take the first available option, drilling through however
 * many nested category levels Workday's hierarchical picker shows (e.g.
 * "How Did You Hear About Us?" -> "Advertising" -> "Advertising - Outdoor"). */
const AUTO_FIRST_OPTION_PATTERNS: RegExp[] = [/how did you hear about us/i];

function isAutoFirstOptionQuestion(text: string): boolean {
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

/** Finds empty text/search fields matching one of AUTO_FIRST_OPTION_PATTERNS
 * and clicks through their dropdown, always taking the first option at
 * every level, until no further options appear (selection committed) or a
 * safety depth cap is hit. Run before the main fill pass so the field is
 * already non-empty by the time it would otherwise be collected as an
 * "unmatched" candidate for the answer-bank/AI pass. */
export async function answerFirstOptionQuestions(): Promise<number> {
  let answered = 0;

  const candidates = Array.from(
    document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="search"], input:not([type])'),
  ).filter((el) => isVisible(el) && el.value.trim() === "");

  for (const input of candidates) {
    const label = getAssociatedLabelText(input);
    if (!label || !isAutoFirstOptionQuestion(label)) continue;

    input.click();

    for (let depth = 0; depth < 5; depth++) {
      const option = await waitFor(findFirstVisibleOption, depth === 0 ? 1000 : 500);
      if (!option) break;
      option.click();
    }

    answered++;
  }

  return answered;
}
