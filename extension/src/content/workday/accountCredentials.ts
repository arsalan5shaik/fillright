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

/** The "I agree to create an account and submit my work information"
 * consent checkbox that gates the Create Account button on this step -
 * matched narrowly on its own wording so this never touches an unrelated
 * checkbox (EEO consent, newsletter opt-in, etc.) elsewhere in the form.
 * Unaffected by the email/password issue above - a plain checkbox .click()
 * isn't gated behind the same click_filter/reCAPTCHA-style validation. */
export function checkAccountCreationConsent(): boolean {
  const checkbox = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find((el) => {
    if (!isVisible(el) || el.checked) return false;
    const label = getAssociatedLabelText(el);
    return label !== null && /agree.{0,40}create an account/i.test(label);
  });
  if (!checkbox) return false;

  checkbox.click();
  markField(checkbox, "high");
  return true;
}
