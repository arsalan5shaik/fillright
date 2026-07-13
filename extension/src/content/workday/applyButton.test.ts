import { describe, expect, it } from "vitest";

import { findApplyButton, findApplyManuallyButton } from "./applyButton";

function markVisible(): void {
  for (const el of document.querySelectorAll("button, a")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

describe("findApplyButton", () => {
  it("finds a <button> with exact text 'Apply'", () => {
    document.body.innerHTML = `
      <button id="save">Save Job</button>
      <button id="apply">Apply</button>
    `;
    markVisible();
    expect(findApplyButton()?.id).toBe("apply");
  });

  it("finds an <a role=button> styled as the apply CTA", () => {
    document.body.innerHTML = `<a id="apply-link" role="button" href="/apply">Apply</a>`;
    markVisible();
    expect(findApplyButton()?.id).toBe("apply-link");
  });

  it("prefers an exact 'Apply' match over 'Apply Manually'", () => {
    document.body.innerHTML = `
      <button id="manual">Apply Manually</button>
      <button id="apply">Apply</button>
    `;
    markVisible();
    expect(findApplyButton()?.id).toBe("apply");
  });

  it("falls back to a partial match when there's no exact 'Apply' button", () => {
    document.body.innerHTML = `<button id="manual">Apply Manually</button>`;
    markVisible();
    expect(findApplyButton()?.id).toBe("manual");
  });

  it("returns null when there's no apply-like button on the page", () => {
    document.body.innerHTML = `<button id="save">Save Job</button>`;
    markVisible();
    expect(findApplyButton()).toBeNull();
  });

  it("ignores a hidden Apply button", () => {
    document.body.innerHTML = `<button id="apply">Apply</button>`;
    // deliberately not calling markVisible() - offsetParent stays null in jsdom
    expect(findApplyButton()).toBeNull();
  });
});

describe("findApplyManuallyButton", () => {
  it("finds the 'Apply Manually' option in Workday's Start Your Application modal", () => {
    document.body.innerHTML = `
      <button id="autofill">Autofill with Resume</button>
      <button id="manual">Apply Manually</button>
      <button id="last">Use My Last Application</button>
    `;
    markVisible();
    expect(findApplyManuallyButton()?.id).toBe("manual");
  });

  it("returns null when the modal isn't showing", () => {
    document.body.innerHTML = `<button id="apply">Apply</button>`;
    markVisible();
    expect(findApplyManuallyButton()).toBeNull();
  });

  it("ignores a hidden 'Apply Manually' option", () => {
    document.body.innerHTML = `<button id="manual">Apply Manually</button>`;
    expect(findApplyManuallyButton()).toBeNull();
  });
});
