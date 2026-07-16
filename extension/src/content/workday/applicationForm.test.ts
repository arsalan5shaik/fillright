import { describe, expect, it } from "vitest";

import { isWizardStep, looksLikeApplicationForm } from "./applicationForm";

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

describe("isWizardStep", () => {
  it("returns true inside the apply flow (applyFlow* wrapper present)", () => {
    document.body.innerHTML = `
      <div data-automation-id="applyFlowMyExpPage">
        <h4>My Experience</h4>
      </div>
    `;
    expect(isWizardStep()).toBe(true);
  });

  it("returns true on an Add-gated step and on the create-account step", () => {
    document.body.innerHTML = `<button data-automation-id="add-button">Add</button>`;
    expect(isWizardStep()).toBe(true);

    document.body.innerHTML = `<input type="password" />`;
    markVisible();
    expect(isWizardStep()).toBe(true);
  });

  it("returns false on a job-posting page even with incidental fields (no applyFlow wrapper)", () => {
    // A posting page can trip looksLikeApplicationForm() via a search box +
    // job-alert email + filter, but must NOT be treated as a wizard step.
    document.body.innerHTML = `
      <input type="search" placeholder="Search jobs" />
      <input type="email" placeholder="Job alerts" />
      <input type="text" placeholder="Location filter" />
      <button>Apply</button>
    `;
    markVisible();
    expect(looksLikeApplicationForm()).toBe(true);
    expect(isWizardStep()).toBe(false);
  });
});
