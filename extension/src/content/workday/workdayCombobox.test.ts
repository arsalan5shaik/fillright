import { describe, expect, it } from "vitest";

import { isComboboxEmpty, isWorkdayComboboxTrigger, selectComboboxOption, setWorkdayComboboxValue } from "./workdayCombobox";

function markVisible(): void {
  for (const el of document.querySelectorAll("input, button, li")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

describe("isWorkdayComboboxTrigger", () => {
  it("recognizes a button with aria-haspopup=listbox", () => {
    document.body.innerHTML = `<button aria-haspopup="listbox" type="button">Select One</button>`;
    expect(isWorkdayComboboxTrigger(document.querySelector("button")!)).toBe(true);
  });

  it("rejects a plain button", () => {
    document.body.innerHTML = `<button type="button">Save and Continue</button>`;
    expect(isWorkdayComboboxTrigger(document.querySelector("button")!)).toBe(false);
  });
});

describe("isComboboxEmpty", () => {
  it("treats 'Select One' as empty", () => {
    document.body.innerHTML = `<button>Select One</button>`;
    expect(isComboboxEmpty(document.querySelector("button")!)).toBe(true);
  });

  it("treats an actual selected value as not empty", () => {
    document.body.innerHTML = `<button>Texas</button>`;
    expect(isComboboxEmpty(document.querySelector("button")!)).toBe(false);
  });
});

describe("setWorkdayComboboxValue", () => {
  function buildWidget(): HTMLButtonElement {
    document.body.innerHTML = `
      <div id="wrapper">
        <button aria-haspopup="listbox" type="button" id="trigger">Select One</button>
        <input type="text" id="filter" />
      </div>
      <ul role="listbox">
        <li role="option">California</li>
        <li role="option">Texas</li>
        <li role="option">New York</li>
      </ul>
    `;
    markVisible();
    return document.getElementById("trigger") as HTMLButtonElement;
  }

  it("clicks the option matching the exact value", async () => {
    const button = buildWidget();
    let clicked = false;
    document.querySelectorAll('[role="option"]').forEach((opt) => {
      if (opt.textContent === "Texas") opt.addEventListener("click", () => (clicked = true));
    });

    const result = await setWorkdayComboboxValue(button, "Texas");

    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });

  it("matches a state abbreviation against the full option name", async () => {
    const button = buildWidget();
    let clicked = false;
    document.querySelectorAll('[role="option"]').forEach((opt) => {
      if (opt.textContent === "Texas") opt.addEventListener("click", () => (clicked = true));
    });

    const result = await setWorkdayComboboxValue(button, "TX");

    expect(result).toBe(true);
    expect(clicked).toBe(true);
  });

  it("returns false when no option matches", async () => {
    const button = buildWidget();
    const result = await setWorkdayComboboxValue(button, "Nowhereland");
    expect(result).toBe(false);
  });
});

describe("selectComboboxOption (degree-style contains match)", () => {
  it("picks 'B.S. - Bachelor of Science' from a 'Bachelor of Science' candidate", async () => {
    document.body.innerHTML = `
      <div>
        <button aria-haspopup="listbox" type="button" id="degree">Select One</button>
        <input type="text" id="filter" />
      </div>
      <ul role="listbox">
        <li role="option">A.A. - Associate of Arts</li>
        <li role="option">B.S. - Bachelor of Science</li>
        <li role="option">M.S. - Master of Science</li>
      </ul>
    `;
    markVisible();

    const button = document.getElementById("degree") as HTMLButtonElement;
    let clicked = "";
    document.querySelectorAll('[role="option"]').forEach((opt) => {
      opt.addEventListener("click", () => (clicked = opt.textContent ?? ""));
    });

    const result = await selectComboboxOption(
      button,
      ["Bachelor's Degree", "Bachelor of Science", "Bachelor"],
      "Bachelor",
    );

    expect(result).toBe(true);
    expect(clicked).toBe("B.S. - Bachelor of Science");
  });
});
