import { getAssociatedLabelText } from "./formUtils";

/** Every file-upload step needs a real <input type="file"> in the DOM for
 * the browser to allow selection at all - but Workday (and most custom
 * dropzone widgets) render that input display:none behind a styled overlay,
 * so it is deliberately NOT filtered by isVisible here. Filtering by
 * visibility was the bug that made the résumé never upload: the input was
 * always there, just visually hidden, so isVisible() rejected it and
 * findResumeFileInput() returned null. Only genuinely disabled inputs are
 * excluded. */
function candidateFileInputs(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter((el) => !el.disabled);
}

/** A hidden file input rarely has its own <label for>, so also checks the
 * input's own attributes and the NEAREST section heading above it for text
 * like "Resume/CV" / "Cover Letter". Stops at the first heading found going
 * up so a résumé slot and a cover-letter slot sharing a high ancestor don't
 * cross-contaminate each other's context. */
function fileInputContextText(el: HTMLInputElement): string {
  const parts: string[] = [getAssociatedLabelText(el) ?? "", el.getAttribute("data-automation-id") ?? "", el.name ?? ""];
  let container: HTMLElement | null = el.parentElement;
  for (let depth = 0; container && depth < 5; depth++, container = container.parentElement) {
    const heading = container.querySelector("h1, h2, h3, h4, h5, label, legend");
    if (heading?.textContent?.trim()) {
      parts.push(heading.textContent);
      break;
    }
  }
  return parts.join(" ");
}

function findLabeledFileInput(pattern: RegExp): HTMLInputElement | null {
  return candidateFileInputs().find((el) => pattern.test(fileInputContextText(el))) ?? null;
}

/** Prefers a file input whose own label clearly says "resume"/"CV" - a step
 * with a separate cover-letter upload slot must never have the resume end
 * up there instead. Falls back to "the only file input on the page" only
 * when there's exactly one and it isn't labeled as the cover-letter slot
 * (the common single-upload case); with multiple unlabeled/ambiguous
 * inputs, this doesn't guess which one is the resume. */
function isWorkdayUploadInput(el: HTMLInputElement): boolean {
  return (el.getAttribute("data-automation-id") ?? "").startsWith("file-upload-input");
}

export function findResumeFileInput(): HTMLInputElement | null {
  const labeled = findLabeledFileInput(/resume|\bcv\b/i);
  if (labeled) return labeled;

  // Workday's résumé upload input is data-automation-id="file-upload-input-…"
  // inside a "file-upload-drop-zone" (confirmed live). Prefer that, excluding
  // any that sit in a cover-letter section.
  const resumeUploads = candidateFileInputs().filter(
    (el) => isWorkdayUploadInput(el) && !/cover letter/i.test(fileInputContextText(el)),
  );
  if (resumeUploads.length === 1) return resumeUploads[0];

  const inputs = candidateFileInputs();
  const hasCoverLetterSlot = inputs.some((el) => /cover letter/i.test(fileInputContextText(el)));
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
