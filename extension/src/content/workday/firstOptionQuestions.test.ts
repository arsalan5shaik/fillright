import { describe, expect, it } from "vitest";

import { answerFirstOptionQuestions } from "./firstOptionQuestions";

function markVisible(): void {
  for (const el of document.querySelectorAll("input, li")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

describe("answerFirstOptionQuestions", () => {
  it("drills through nested option levels, always picking the first one, until nothing is left", async () => {
    document.body.innerHTML = `
      <label for="hdyhau">How Did You Hear About Us?</label>
      <input id="hdyhau" type="text" />
      <ul id="options"></ul>
    `;
    markVisible();

    const input = document.getElementById("hdyhau") as HTMLInputElement;
    const optionsContainer = document.getElementById("options")!;
    let level = 0;

    const renderLevel = () => {
      if (level === 0) {
        optionsContainer.innerHTML = `
          <li role="option" id="advertising">Advertising</li>
          <li role="option" id="referral">Employee Referral</li>
        `;
      } else if (level === 1) {
        optionsContainer.innerHTML = `
          <li role="option" id="outdoor">Advertising - Outdoor</li>
          <li role="option" id="print">Advertising - Print</li>
        `;
      } else {
        optionsContainer.innerHTML = "";
      }
      markVisible();
    };

    input.addEventListener("click", renderLevel);
    optionsContainer.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).getAttribute("role") === "option") {
        level++;
        renderLevel();
      }
    });

    const answered = await answerFirstOptionQuestions();

    expect(answered).toBe(1);
    expect(optionsContainer.innerHTML.trim()).toBe("");
  }, 10000);

  it("ignores unrelated empty text fields", async () => {
    document.body.innerHTML = `
      <label for="first-name">First Name</label>
      <input id="first-name" type="text" />
    `;
    markVisible();

    const answered = await answerFirstOptionQuestions();

    expect(answered).toBe(0);
  });

  it("skips a field that's already answered", async () => {
    document.body.innerHTML = `
      <label for="hdyhau">How Did You Hear About Us?</label>
      <input id="hdyhau" type="text" value="Website" />
    `;
    markVisible();

    const answered = await answerFirstOptionQuestions();

    expect(answered).toBe(0);
  });
});
