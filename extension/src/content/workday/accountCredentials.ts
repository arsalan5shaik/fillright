import { getAssociatedLabelText, isVisible, setFieldValue } from "./formUtils";
import { markField } from "./confidenceUi";

/** Best-effort heuristic, unverified against a live Workday account-creation
 * page (see Milestone 13/16 notes on the lack of real wizard HTML): a
 * password-type input appearing on a step is a strong, structural signal
 * that this is Workday's own "create a candidate account" step for this
 * tenant, as opposed to the regular "My Information" contact-email field
 * (which never has a password alongside it). Filling this first, before the
 * generic fill pass runs, means the generic "email" concept never has a
 * chance to also grab this field - the "don't clobber a non-empty field"
 * rule in fillEngine.ts naturally prevents any double-fill. */
function findEmptyPasswordInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]')).filter(
    (el) => isVisible(el) && el.value.trim() === "",
  );
}

export function findAccountCreationFields(): { emailInput: HTMLInputElement | null; passwordInputs: HTMLInputElement[] } | null {
  const passwordInputs = findEmptyPasswordInputs();
  if (passwordInputs.length === 0) return null;

  const emailInput =
    Array.from(document.querySelectorAll<HTMLInputElement>('input[type="email"], input[type="text"]')).find((el) => {
      if (!isVisible(el) || el.value.trim() !== "") return false;
      const label = getAssociatedLabelText(el);
      return label !== null && /email/i.test(label);
    }) ?? null;

  return { emailInput, passwordInputs };
}

/** Fills the detected account-creation email + all password/confirm-password
 * fields with the same saved credential. Returns whether anything was
 * actually filled, so the caller can report it (or not) in the status UI.
 *
 * Deliberately re-queries the password inputs fresh - both right after
 * filling email, and again between each individual password fill - rather
 * than reusing one snapshot captured up front. Setting one field's value
 * can trigger a framework re-render that replaces sibling inputs' DOM
 * nodes, leaving any references captured before that re-render silently
 * pointing at now-detached elements (no error, just no visible effect). */
export function fillAccountCreationFields(email: string, password: string): boolean {
  const initial = findAccountCreationFields();
  if (!initial) return false;

  let filled = false;

  if (initial.emailInput) {
    setFieldValue(initial.emailInput, email);
    markField(initial.emailInput, "high");
    filled = true;
  }

  for (let guard = 0; guard < 5; guard++) {
    const remaining = findEmptyPasswordInputs();
    if (remaining.length === 0) break;
    setFieldValue(remaining[0], password);
    markField(remaining[0], "high");
    filled = true;
  }

  return filled;
}
