import { describe, expect, it } from "vitest";

import { isSensitive, runRequiredFieldFallback } from "./requiredFields";

function markVisible(): void {
  for (const el of document.querySelectorAll("input, button, li")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

function commitOnClick(button: HTMLButtonElement): void {
  document.querySelectorAll('[role="option"]').forEach((opt) => {
    opt.addEventListener("click", () => {
      button.textContent = opt.textContent;
    });
  });
}

describe("isSensitive", () => {
  it("flags EEO / legal questions", () => {
    expect(isSensitive("Gender")).toBe(true);
    expect(isSensitive("Race / Ethnicity")).toBe(true);
    expect(isSensitive("Are you a protected veteran?")).toBe(true);
    expect(isSensitive("Disability status")).toBe(true);
    expect(isSensitive("Have you ever been convicted of a felony?")).toBe(true);
  });

  it("does not flag ordinary application questions", () => {
    expect(isSensitive("What is your preferred start date?")).toBe(false);
    expect(isSensitive("Are you willing to travel?")).toBe(false);
    expect(isSensitive("Highest level of education")).toBe(false);
  });
});

describe("runRequiredFieldFallback - sensitive dropdown", () => {
  it("picks 'Decline to answer' on a required sensitive dropdown, never an AI guess", async () => {
    document.body.innerHTML = `
      <div data-automation-id="formField-gender">
        <label for="gender">Gender *</label>
        <div>
          <button aria-haspopup="listbox" aria-required="true" type="button" id="gender">Select One</button>
          <input type="text" />
        </div>
      </div>
      <ul role="listbox">
        <li role="option">Male</li>
        <li role="option">Female</li>
        <li role="option">Decline to answer</li>
      </ul>
    `;
    markVisible();
    commitOnClick(document.getElementById("gender") as HTMLButtonElement);

    const filled = await runRequiredFieldFallback();

    expect(filled).toBe(1);
    expect((document.getElementById("gender") as HTMLButtonElement).textContent).toBe("Decline to answer");
  }, 8000);

  it("leaves a non-required dropdown alone (no AI call needed)", async () => {
    document.body.innerHTML = `
      <div data-automation-id="formField-optional">
        <label for="opt">Optional preference</label>
        <div>
          <button aria-haspopup="listbox" type="button" id="opt">Select One</button>
          <input type="text" />
        </div>
      </div>
      <ul role="listbox"><li role="option">A</li></ul>
    `;
    markVisible();

    const filled = await runRequiredFieldFallback();

    expect(filled).toBe(0);
    expect((document.getElementById("opt") as HTMLButtonElement).textContent).toBe("Select One");
  });
});
