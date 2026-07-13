export type FillableInput = HTMLInputElement | HTMLTextAreaElement;

const FILLABLE_INPUT_TYPES = new Set(["text", "email", "tel", "search", "url", ""]);

export function isFillableTextInput(el: Element): el is FillableInput {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) return FILLABLE_INPUT_TYPES.has(el.type);
  return false;
}

export function isVisible(el: HTMLElement): boolean {
  return el.offsetParent !== null && !(el as HTMLInputElement).disabled;
}

function resolveLabelledBy(el: HTMLElement): string | null {
  const ids = el.getAttribute("aria-labelledby");
  if (!ids) return null;
  const texts = ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent?.trim())
    .filter(Boolean);
  return texts.length > 0 ? texts.join(" ") : null;
}

/** Tries, in order: aria-label, aria-labelledby, <label for>, an ancestor
 * <label>, then a nearby preceding text node as a last resort - Workday
 * wraps most fields in enough markup that one of the first three usually
 * hits, but the fallback keeps this working even when it doesn't. */
export function getAssociatedLabelText(el: HTMLElement): string | null {
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const labelledBy = resolveLabelledBy(el);
  if (labelledBy) return labelledBy;

  if (el.id) {
    // Compare .htmlFor directly rather than building a `label[for="..."]`
    // selector string - Workday's generated ids can contain characters
    // (colons, etc.) that would need CSS.escape, and this sidesteps that
    // entirely rather than depending on it.
    const forLabel = Array.from(document.querySelectorAll("label")).find((label) => label.htmlFor === el.id);
    if (forLabel?.textContent?.trim()) return forLabel.textContent.trim();
  }

  const ancestorLabel = el.closest("label");
  if (ancestorLabel?.textContent?.trim()) return ancestorLabel.textContent.trim();

  // Last resort: look for label-shaped text in a nearby ancestor container,
  // e.g. Workday's fairly consistent "field wrapper" divs.
  let container: HTMLElement | null = el.parentElement;
  for (let depth = 0; container && depth < 4; depth++, container = container.parentElement) {
    const labelLike = container.querySelector("label, legend");
    if (labelLike?.textContent?.trim()) return labelLike.textContent.trim();
  }

  return null;
}

const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLTextAreaElement.prototype,
  "value",
)?.set;

/** React (and similar frameworks) override the native value setter to hook
 * their own onChange handling, so a plain `el.value = x` is silently
 * ignored by the framework's state. Calling the native setter directly
 * before dispatching the event is the standard workaround. */
export function setFieldValue(el: FillableInput, value: string): void {
  const setter = el instanceof HTMLTextAreaElement ? nativeTextareaValueSetter : nativeInputValueSetter;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
}

/** Native <select> only - Workday's custom button/listbox "prompt" widgets
 * aren't real <select> elements and aren't handled here; see Milestone 13
 * notes on why simulating clicks on unverified custom components was
 * deliberately left out. */
export function setSelectValue(el: HTMLSelectElement, value: string): boolean {
  const normalizedTarget = value.trim().toLowerCase();
  const option = Array.from(el.options).find(
    (opt) => opt.textContent?.trim().toLowerCase() === normalizedTarget || opt.value.toLowerCase() === normalizedTarget,
  );
  if (!option) return false;
  el.value = option.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
