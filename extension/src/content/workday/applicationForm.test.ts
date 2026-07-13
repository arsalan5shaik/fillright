import { describe, expect, it } from "vitest";

import { looksLikeApplicationForm } from "./applicationForm";

function markVisible(): void {
  for (const el of document.querySelectorAll("input")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

describe("looksLikeApplicationForm", () => {
  it("returns true with 3+ visible form fields", () => {
    document.body.innerHTML = `
      <input type="text" />
      <input type="text" />
      <input type="text" />
    `;
    markVisible();
    expect(looksLikeApplicationForm()).toBe(true);
  });

  it("returns true for a lean sign-in interstitial (just a password field)", () => {
    document.body.innerHTML = `<input type="password" />`;
    markVisible();
    expect(looksLikeApplicationForm()).toBe(true);
  });

  it("returns true for a step that's entirely behind Add-gated sections with zero visible fields", () => {
    document.body.innerHTML = `
      <h4>Work Experience</h4>
      <button data-automation-id="add-button">Add</button>
      <h4>Education</h4>
      <button data-automation-id="add-button">Add</button>
    `;
    markVisible();
    expect(looksLikeApplicationForm()).toBe(true);
  });

  it("returns false for a page with none of these signals (e.g. the job posting page)", () => {
    document.body.innerHTML = `<button>Apply</button><p>Some job description text.</p>`;
    markVisible();
    expect(looksLikeApplicationForm()).toBe(false);
  });
});
