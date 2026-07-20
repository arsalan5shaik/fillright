import { describe, expect, it } from "vitest";

import {
  fillTypeaheadCombobox,
  isComboboxEmpty,
  isWorkdayComboboxTrigger,
  selectComboboxOption,
  setWorkdayComboboxValue,
} from "./workdayCombobox";

function markVisible(): void {
  for (const el of document.querySelectorAll("input, button, li")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

// Mirrors real Workday: clicking an option commits it by updating the trigger
// button's text - which is exactly what the verify-and-retry logic checks.
function commitOnClick(button: HTMLButtonElement): void {
  document.querySelectorAll('[role="option"]').forEach((opt) => {
    opt.addEventListener("click", () => {
      button.textContent = opt.textContent;
    });
  });
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
    const button = document.getElementById("trigger") as HTMLButtonElement;
    commitOnClick(button);
    return button;
  }

  it("clicks the option matching the exact value and reflects it on the trigger", async () => {
    const button = buildWidget();
    const result = await setWorkdayComboboxValue(button, "Texas");
    expect(result).toBe(true);
    expect(button.textContent).toBe("Texas");
  });

  it("matches a state abbreviation against the full option name", async () => {
    const button = buildWidget();
    const result = await setWorkdayComboboxValue(button, "TX");
    expect(result).toBe(true);
    expect(button.textContent).toBe("Texas");
  });

  it("returns false when no option matches", async () => {
    const button = buildWidget();
    const result = await setWorkdayComboboxValue(button, "Nowhereland");
    expect(result).toBe(false);
  }, 12000);

  it("returns true without re-opening an already-selected combobox (idempotent)", async () => {
    document.body.innerHTML = `
      <button aria-haspopup="listbox" type="button" id="t">Texas</button>
      <ul role="listbox"><li role="option">California</li></ul>
    `;
    markVisible();
    const button = document.getElementById("t") as HTMLButtonElement;
    let clicked = false;
    document.querySelector('[role="option"]')!.addEventListener("click", () => (clicked = true));
    const result = await selectComboboxOption(button, ["California"], "California");
    expect(result).toBe(true);
    expect(clicked).toBe(false);
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
    commitOnClick(button);

    const result = await selectComboboxOption(button, ["Bachelor's Degree", "Bachelor of Science", "Bachelor"], "Bachelor");

    expect(result).toBe(true);
    expect(button.textContent).toBe("B.S. - Bachelor of Science");
  });
});

describe("fillTypeaheadCombobox", () => {
  it("types the value and clicks the matching search result", async () => {
    document.body.innerHTML = `
      <input type="text" id="school" />
      <ul role="listbox">
        <li role="option">Boston University</li>
        <li role="option">Boston College</li>
      </ul>
    `;
    markVisible();
    const input = document.getElementById("school") as HTMLInputElement;
    let picked = "";
    document.querySelectorAll('[role="option"]').forEach((o) =>
      o.addEventListener("click", () => (picked = o.textContent ?? "")),
    );

    const ok = await fillTypeaheadCombobox(input, "Boston University");

    expect(ok).toBe(true);
    expect(picked).toBe("Boston University");
    expect(input.value).toBe("Boston University");
  });

  it("falls back to the top result when none exactly matches the typed value", async () => {
    document.body.innerHTML = `
      <input type="text" id="school" />
      <ul role="listbox"><li role="option">Riverdale College of Engineering</li></ul>
    `;
    markVisible();
    const input = document.getElementById("school") as HTMLInputElement;
    let picked = "";
    document.querySelector('[role="option"]')!.addEventListener("click", (e) => {
      picked = (e.currentTarget as HTMLElement).textContent ?? "";
    });

    const ok = await fillTypeaheadCombobox(input, "Zzz Institute");

    expect(ok).toBe(true);
    expect(picked).toBe("Riverdale College of Engineering");
  }, 8000);
});
