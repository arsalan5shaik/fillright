import { isVisible } from "./formUtils";

const APPLY_TEXT = /^apply$/i;

/** Workday's own "Apply" call-to-action on the job posting page - clicking
 * it navigates into the application flow (usually a sign-in/create-account
 * step first, then the multi-step wizard). Prefers an exact "Apply" match
 * over secondary actions like "Apply Manually", since this is the button
 * that starts the standard flow the rest of the extension autofills. */
export function findApplyButton(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]')).filter(
    (el) => isVisible(el) && el.textContent?.trim(),
  );

  const exact = candidates.find((el) => APPLY_TEXT.test(el.textContent!.trim()));
  if (exact) return exact;

  return candidates.find((el) => /apply/i.test(el.textContent!.trim())) ?? null;
}
