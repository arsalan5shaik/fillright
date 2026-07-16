import { getAssociatedLabelText, isVisible } from "./formUtils";
import { markField } from "./confidenceUi";

/** A password-type input appearing on a step is a strong, structural
 * signal that this is Workday's own "create a candidate account" step for
 * this tenant, as opposed to the regular "My Information" contact-email
 * field (which never has a password alongside it). Used only for step
 * detection now - email/password are no longer autofilled here (Workday's
 * invisible-reCAPTCHA-style click_filter/noCaptchaWrapper on the Create
 * Account button never accepted programmatically-set values as genuine,
 * confirmed live even after switching to per-character keystroke
 * simulation - the user enters these two fields by hand instead). */
export function hasAccountCreationStep(): boolean {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]')).some(
    (el) => isVisible(el) && el.value.trim() === "",
  );
}

/** Workday's create-account / sign-in step, detected robustly (even after
 * the user has typed their password, so it doesn't flip to false mid-way):
 * the createAccountSubmitButton automation-id (confirmed live) or any visible
 * password field. On this step the extension must stay hands-off - see
 * runApplicationFormFill for why the full fill pass here breaks the reCAPTCHA-
 * gated Create Account button. */
export function isAuthStep(): boolean {
  if (document.querySelector('[data-automation-id="createAccountSubmitButton"]')) return true;
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]')).some(isVisible);
}

/** The consent checkbox that gates the Create Account button. Broadened
 * beyond the old "agree … create an account" wording to also catch tenants
 * whose text is e.g. "I have read the notice and consent to the terms" -
 * safe because this is only invoked on the auth step (see runApplicationFormFill),
 * where the sole checkbox is this consent box. A plain checkbox .click() isn't
 * gated behind the reCAPTCHA-style validation the way the submit button is. */
export function checkAccountCreationConsent(): boolean {
  const checkbox = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((el) => {
    if (!isVisible(el) || el.checked) return false;
    const label = getAssociatedLabelText(el);
    return label !== null && /\b(agree|consent|acknowledge|i have read)\b/i.test(label);
  });
  if (!checkbox) return false;

  checkbox.click();
  markField(checkbox, "high");
  return true;
}
