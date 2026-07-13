import { getAssociatedLabelText, isVisible } from "./formUtils";
import { markField } from "./confidenceUi";

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;

/** Workday's account-creation step has a live "Password Requirements"
 * checklist (uppercase/lowercase/number/special-char/length), which is a
 * strong sign its validation re-runs per keystroke rather than just on
 * blur - and the Create Account button stays unresponsive if that
 * validation state never gets set, even though the field visibly shows the
 * right value (confirmed live: filled via the normal one-shot
 * value+input+change+blur dispatch, the button wouldn't respond to clicks,
 * but reloading and typing the exact same value by hand worked fine).
 * Dispatching one keydown/input/keyup per character - not just once for
 * the whole value - is the more realistic simulation most such validators
 * expect. Scoped to this account-creation flow only, not the shared
 * setFieldValue used by every other already-working field. */
function simulateTyping(el: HTMLInputElement, value: string): void {
  el.focus();
  let current = "";
  for (const char of value) {
    current += char;
    el.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(el, current);
    } else {
      el.value = current;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

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

/** The "I agree to create an account and submit my work information"
 * consent checkbox that gates the Create Account button on this step -
 * matched narrowly on its own wording so this never touches an unrelated
 * checkbox (EEO consent, newsletter opt-in, etc.) elsewhere in the form. */
function findAccountCreationConsentCheckbox(): HTMLInputElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((el) => {
      if (!isVisible(el) || el.checked) return false;
      const label = getAssociatedLabelText(el);
      return label !== null && /agree.{0,40}create an account/i.test(label);
    }) ?? null
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
    simulateTyping(initial.emailInput, email);
    markField(initial.emailInput, "high");
    filled = true;
  }

  for (let guard = 0; guard < 5; guard++) {
    const remaining = findEmptyPasswordInputs();
    if (remaining.length === 0) break;
    simulateTyping(remaining[0], password);
    markField(remaining[0], "high");
    filled = true;
  }

  // Queried fresh here, after email/password are already filled, for the
  // same reason those are re-queried between fills - a re-render triggered
  // by the earlier fills could otherwise leave a captured reference stale.
  const consentCheckbox = findAccountCreationConsentCheckbox();
  if (consentCheckbox) {
    consentCheckbox.click();
    markField(consentCheckbox, "high");
    filled = true;
  }

  return filled;
}
