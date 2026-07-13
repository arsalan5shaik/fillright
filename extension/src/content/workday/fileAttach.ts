import { getAssociatedLabelText, isVisible } from "./formUtils";

/** Any real file-upload step needs an actual <input type="file"> somewhere
 * in the DOM for the browser to allow file selection at all, even if
 * Workday's visible dropzone is a custom-styled overlay - so this doesn't
 * need to guess a tenant-specific automation-id the way other fields might. */
function visibleFileInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(isVisible);
}

function findLabeledFileInput(pattern: RegExp): HTMLInputElement | null {
  return (
    visibleFileInputs().find((el) => {
      const label = getAssociatedLabelText(el);
      return label !== null && pattern.test(label);
    }) ?? null
  );
}

/** Prefers a file input whose own label clearly says "resume"/"CV" - a step
 * with a separate cover-letter upload slot must never have the resume end
 * up there instead. Falls back to "the only file input on the page" only
 * when there's exactly one and it isn't labeled as the cover-letter slot
 * (the common single-upload case); with multiple unlabeled/ambiguous
 * inputs, this doesn't guess which one is the resume. */
export function findResumeFileInput(): HTMLInputElement | null {
  const labeled = findLabeledFileInput(/resume|\bcv\b/i);
  if (labeled) return labeled;

  const inputs = visibleFileInputs();
  const hasCoverLetterSlot = inputs.some((el) => /cover letter/i.test(getAssociatedLabelText(el) ?? ""));
  return inputs.length === 1 && !hasCoverLetterSlot ? inputs[0] : null;
}

/** Only matches a file input whose label explicitly says "cover letter" -
 * never a generic "second file input" guess. If a tenant doesn't have a
 * dedicated cover-letter upload slot, the cover letter simply isn't
 * uploaded anywhere (never stuffed into the resume slot instead). */
export function findCoverLetterFileInput(): HTMLInputElement | null {
  return findLabeledFileInput(/cover letter/i);
}

/** Programmatically setting input.value for a file input is disallowed by
 * browsers for security reasons, but assigning a DataTransfer's FileList to
 * .files is the standard, well-established workaround for synthetic file
 * injection (the same mechanism used to simulate drag-and-drop uploads). */
export function injectFile(input: HTMLInputElement, blob: Blob, filename: string): void {
  const file = new File([blob], filename, { type: blob.type || "application/pdf" });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
