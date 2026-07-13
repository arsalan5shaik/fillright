import { describe, expect, it } from "vitest";

import { checkAccountCreationConsent, hasAccountCreationStep } from "./accountCredentials";

function markVisible(): void {
  for (const el of document.querySelectorAll("input")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

describe("hasAccountCreationStep", () => {
  it("returns false when there's no password field on the page (e.g. My Information step)", () => {
    document.body.innerHTML = `
      <label for="email">Email</label>
      <input id="email" type="email" />
    `;
    markVisible();
    expect(hasAccountCreationStep()).toBe(false);
  });

  it("returns true when an empty visible password field is present", () => {
    document.body.innerHTML = `
      <label for="pw">Password</label>
      <input id="pw" type="password" />
    `;
    markVisible();
    expect(hasAccountCreationStep()).toBe(true);
  });

  it("does not treat an already-filled password field as an account creation step", () => {
    document.body.innerHTML = `<input id="pw" type="password" value="already-typed" />`;
    markVisible();
    expect(hasAccountCreationStep()).toBe(false);
  });
});

describe("checkAccountCreationConsent", () => {
  it("checks the 'I agree to create an account' consent checkbox", () => {
    document.body.innerHTML = `
      <label for="consent">
        <input id="consent" type="checkbox" />
        I agree to create an account and submit my work information.
      </label>
    `;
    markVisible();

    const checked = checkAccountCreationConsent();

    expect(checked).toBe(true);
    expect((document.getElementById("consent") as HTMLInputElement).checked).toBe(true);
  });

  it("does not uncheck a consent checkbox the user already checked", () => {
    document.body.innerHTML = `
      <label for="consent">
        <input id="consent" type="checkbox" checked />
        I agree to create an account and submit my work information.
      </label>
    `;
    markVisible();

    const checked = checkAccountCreationConsent();

    expect(checked).toBe(false);
    expect((document.getElementById("consent") as HTMLInputElement).checked).toBe(true);
  });

  it("does not check an unrelated checkbox on the same step", () => {
    document.body.innerHTML = `
      <label for="newsletter">
        <input id="newsletter" type="checkbox" />
        Subscribe me to job alerts and newsletters.
      </label>
    `;
    markVisible();

    checkAccountCreationConsent();

    expect((document.getElementById("newsletter") as HTMLInputElement).checked).toBe(false);
  });

  it("returns false when there's no consent checkbox on the page", () => {
    document.body.innerHTML = `<input id="email" type="email" />`;
    markVisible();
    expect(checkAccountCreationConsent()).toBe(false);
  });
});
