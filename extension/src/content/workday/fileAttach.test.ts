import { describe, expect, it } from "vitest";

import { findCoverLetterFileInput, findResumeFileInput } from "./fileAttach";

function markVisible(): void {
  for (const el of document.querySelectorAll("input")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

/** injectFile()'s DataTransfer-based synthetic file injection is NOT
 * covered here: jsdom doesn't implement DataTransfer at all, and its
 * HTMLInputElement.files setter strictly requires a real FileList instance
 * (confirmed empirically - assigning any FileList-like stand-in throws
 * "provided value is not of type 'FileList'"). There's no browser-exposed
 * FileList constructor to fake one with, so unlike the fillEngine suite's
 * offsetParent stub, this genuinely can't be verified outside a real
 * browser - it relies on a long-established, widely-used real-browser API
 * contract (the same technique browser automation tools use for file-input
 * testing) that needs live verification, same as the rest of Milestone
 * 13-15's Workday-DOM-dependent code. */
describe("findResumeFileInput", () => {
  it("finds the only file input on the page when it isn't labeled either way", () => {
    document.body.innerHTML = `<input type="file" id="resume-upload" />`;
    markVisible();
    expect(findResumeFileInput()?.id).toBe("resume-upload");
  });

  it("returns null when there's no file input", () => {
    document.body.innerHTML = `<input type="text" />`;
    markVisible();
    expect(findResumeFileInput()).toBeNull();
  });

  it("prefers the input labeled 'Resume/CV' over an unlabeled one", () => {
    document.body.innerHTML = `
      <label for="resume-input">Resume/CV</label>
      <input id="resume-input" type="file" />
      <label for="other-input">Additional Document</label>
      <input id="other-input" type="file" />
    `;
    markVisible();
    expect(findResumeFileInput()?.id).toBe("resume-input");
  });

  it("never picks the cover-letter-labeled input, even as the lone remaining option", () => {
    document.body.innerHTML = `
      <label for="cover-letter-input">Cover Letter</label>
      <input id="cover-letter-input" type="file" />
    `;
    markVisible();
    expect(findResumeFileInput()).toBeNull();
  });

  it("does not guess between two unlabeled file inputs", () => {
    document.body.innerHTML = `
      <input id="input-a" type="file" />
      <input id="input-b" type="file" />
    `;
    markVisible();
    expect(findResumeFileInput()).toBeNull();
  });
});

describe("findCoverLetterFileInput", () => {
  it("finds the input labeled 'Cover Letter'", () => {
    document.body.innerHTML = `
      <label for="resume-input">Resume/CV</label>
      <input id="resume-input" type="file" />
      <label for="cover-letter-input">Cover Letter</label>
      <input id="cover-letter-input" type="file" />
    `;
    markVisible();
    expect(findCoverLetterFileInput()?.id).toBe("cover-letter-input");
  });

  it("returns null when there's no dedicated cover-letter upload slot", () => {
    document.body.innerHTML = `
      <label for="resume-input">Resume/CV</label>
      <input id="resume-input" type="file" />
    `;
    markVisible();
    expect(findCoverLetterFileInput()).toBeNull();
  });
});
