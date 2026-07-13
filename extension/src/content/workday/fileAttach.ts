/** Any real resume/CV upload step needs an actual <input type="file">
 * somewhere in the DOM for the browser to allow file selection at all, even
 * if Workday's visible dropzone is a custom-styled overlay - so this
 * doesn't need to guess a tenant-specific automation-id the way other
 * fields might. Picks the first one on the page; a page with more than one
 * file input (e.g. resume + separate cover-letter upload) isn't handled
 * specially here. */
export function findResumeFileInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[type="file"]');
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
