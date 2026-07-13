import { beforeEach, describe, expect, it } from "vitest";

import { fillAccountCreationFields, findAccountCreationFields } from "./accountCredentials";

function markVisible(): void {
  for (const el of document.querySelectorAll("input")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

describe("account creation field detection", () => {
  it("returns null when there's no password field on the page (e.g. My Information step)", () => {
    document.body.innerHTML = `
      <label for="email">Email</label>
      <input id="email" type="email" />
    `;
    markVisible();
    expect(findAccountCreationFields()).toBeNull();
  });

  it("detects the email + password fields when a password input is present", () => {
    document.body.innerHTML = `
      <label for="acct-email">Email</label>
      <input id="acct-email" type="email" />
      <label for="pw">Password</label>
      <input id="pw" type="password" />
      <label for="pw2">Confirm Password</label>
      <input id="pw2" type="password" />
    `;
    markVisible();
    const fields = findAccountCreationFields();
    expect(fields).not.toBeNull();
    expect(fields!.emailInput?.id).toBe("acct-email");
    expect(fields!.passwordInputs).toHaveLength(2);
  });

  it("fills the email and both password/confirm fields with the same saved credential", () => {
    document.body.innerHTML = `
      <label for="acct-email">Email</label>
      <input id="acct-email" type="email" />
      <label for="pw">Password</label>
      <input id="pw" type="password" />
      <label for="pw2">Confirm Password</label>
      <input id="pw2" type="password" />
    `;
    markVisible();

    const filled = fillAccountCreationFields("me@example.invalid", "SavedPassword123");

    expect(filled).toBe(true);
    expect((document.getElementById("acct-email") as HTMLInputElement).value).toBe("me@example.invalid");
    expect((document.getElementById("pw") as HTMLInputElement).value).toBe("SavedPassword123");
    expect((document.getElementById("pw2") as HTMLInputElement).value).toBe("SavedPassword123");
  });

  it("returns false and fills nothing when there's no password field", () => {
    document.body.innerHTML = `<input id="email" type="email" />`;
    markVisible();
    expect(fillAccountCreationFields("me@example.invalid", "pw")).toBe(false);
  });

  it("does not treat an already-filled password field as something to redetect", () => {
    document.body.innerHTML = `<input id="pw" type="password" value="already-typed" />`;
    markVisible();
    expect(findAccountCreationFields()).toBeNull();
  });

  it("still fills the password fields if setting email replaces them with new DOM nodes (simulates a framework re-render)", () => {
    document.body.innerHTML = `
      <label for="acct-email">Email</label>
      <input id="acct-email" type="email" />
      <div id="password-container">
        <label for="pw">Password</label>
        <input id="pw" type="password" />
        <label for="pw2">Confirm Password</label>
        <input id="pw2" type="password" />
      </div>
    `;
    markVisible();

    const container = document.getElementById("password-container")!;
    document.getElementById("acct-email")!.addEventListener(
      "input",
      () => {
        container.innerHTML = `
          <label for="pw">Password</label>
          <input id="pw" type="password" />
          <label for="pw2">Confirm Password</label>
          <input id="pw2" type="password" />
        `;
        markVisible();
      },
      { once: true },
    );

    const filled = fillAccountCreationFields("me@example.invalid", "SavedPassword123");

    expect(filled).toBe(true);
    expect((document.getElementById("pw") as HTMLInputElement).value).toBe("SavedPassword123");
    expect((document.getElementById("pw2") as HTMLInputElement).value).toBe("SavedPassword123");
  });

  it("checks the 'I agree to create an account' consent checkbox", () => {
    document.body.innerHTML = `
      <label for="acct-email">Email</label>
      <input id="acct-email" type="email" />
      <label for="pw">Password</label>
      <input id="pw" type="password" />
      <label for="consent">
        <input id="consent" type="checkbox" />
        I agree to create an account and submit my work information.
      </label>
    `;
    markVisible();

    const filled = fillAccountCreationFields("me@example.invalid", "SavedPassword123");

    expect(filled).toBe(true);
    expect((document.getElementById("consent") as HTMLInputElement).checked).toBe(true);
  });

  it("does not uncheck a consent checkbox the user already checked", () => {
    document.body.innerHTML = `
      <label for="acct-email">Email</label>
      <input id="acct-email" type="email" />
      <label for="pw">Password</label>
      <input id="pw" type="password" />
      <label for="consent">
        <input id="consent" type="checkbox" checked />
        I agree to create an account and submit my work information.
      </label>
    `;
    markVisible();

    fillAccountCreationFields("me@example.invalid", "SavedPassword123");

    expect((document.getElementById("consent") as HTMLInputElement).checked).toBe(true);
  });

  it("does not check an unrelated checkbox on the same step", () => {
    document.body.innerHTML = `
      <label for="acct-email">Email</label>
      <input id="acct-email" type="email" />
      <label for="pw">Password</label>
      <input id="pw" type="password" />
      <label for="newsletter">
        <input id="newsletter" type="checkbox" />
        Subscribe me to job alerts and newsletters.
      </label>
    `;
    markVisible();

    fillAccountCreationFields("me@example.invalid", "SavedPassword123");

    expect((document.getElementById("newsletter") as HTMLInputElement).checked).toBe(false);
  });
});
