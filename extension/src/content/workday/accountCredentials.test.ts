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
});
