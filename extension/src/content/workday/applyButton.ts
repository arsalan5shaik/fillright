import { isVisible } from "./formUtils";

const APPLY_TEXT = /^apply$/i;
const APPLY_MANUALLY_TEXT = /^apply manually$/i;

function visibleClickables(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('button, a, [role="button"]')).filter(
    (el) => isVisible(el) && el.textContent?.trim(),
  );
}

/** Workday's own "Apply" call-to-action on the job posting page - clicking
 * it navigates into the application flow (usually a sign-in/create-account
 * step first, then the multi-step wizard). Prefers an exact "Apply" match
 * over secondary actions like "Apply Manually", since this is the button
 * that starts the standard flow the rest of the extension autofills. */
export function findApplyButton(): HTMLElement | null {
  const candidates = visibleClickables();
  const exact = candidates.find((el) => APPLY_TEXT.test(el.textContent!.trim()));
  if (exact) return exact;

  return candidates.find((el) => /apply/i.test(el.textContent!.trim())) ?? null;
}

/** Some Workday tenants show a "Start Your Application" modal right after
 * Apply, offering "Autofill with Resume" (Workday's own resume-parsing
 * autofill), "Apply Manually", and "Use My Last Application". This
 * extension does its own field-by-field autofill, so it drives the
 * standard blank-form path ("Apply Manually") rather than Workday's
 * competing autofill. */
export function findApplyManuallyButton(): HTMLElement | null {
  return visibleClickables().find((el) => APPLY_MANUALLY_TEXT.test(el.textContent!.trim())) ?? null;
}
