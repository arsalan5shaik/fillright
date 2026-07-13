import { describe, expect, it } from "vitest";

import { findResumeFileInput } from "./fileAttach";

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
  it("finds the file input on the page", () => {
    document.body.innerHTML = `<input type="file" id="resume-upload" />`;
    expect(findResumeFileInput()?.id).toBe("resume-upload");
  });

  it("returns null when there's no file input", () => {
    document.body.innerHTML = `<input type="text" />`;
    expect(findResumeFileInput()).toBeNull();
  });
});
