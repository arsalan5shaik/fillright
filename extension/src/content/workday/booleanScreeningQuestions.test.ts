import { beforeEach, describe, expect, it } from "vitest";

import { answerConflictOfInterestQuestions } from "./booleanScreeningQuestions";

function markVisible(): void {
  for (const el of document.querySelectorAll("input")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

describe("answerConflictOfInterestQuestions", () => {
  it("answers 'No' via a fieldset/legend question", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Have you ever been employed by The Walt Disney Company or any of its affiliated companies?</legend>
        <label for="yes1"><input id="yes1" type="radio" name="disney-employed" /> Yes</label>
        <label for="no1"><input id="no1" type="radio" name="disney-employed" /> No</label>
      </fieldset>
    `;
    markVisible();

    const answered = answerConflictOfInterestQuestions();

    expect(answered).toBe(1);
    expect((document.getElementById("no1") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("yes1") as HTMLInputElement).checked).toBe(false);
  });

  it("answers 'No' via aria-labelledby on the radiogroup container", () => {
    document.body.innerHTML = `
      <div id="q-text">Is a member of your family a government official?</div>
      <div role="radiogroup" aria-labelledby="q-text">
        <label for="yes2"><input id="yes2" type="radio" name="gov-official" /> Yes</label>
        <label for="no2"><input id="no2" type="radio" name="gov-official" /> No</label>
      </div>
    `;
    markVisible();

    const answered = answerConflictOfInterestQuestions();

    expect(answered).toBe(1);
    expect((document.getElementById("no2") as HTMLInputElement).checked).toBe(true);
  });

  it("does not touch an unrelated Yes/No question", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Are you authorized to work in the United States?</legend>
        <label for="yes3"><input id="yes3" type="radio" name="work-auth" /> Yes</label>
        <label for="no3"><input id="no3" type="radio" name="work-auth" /> No</label>
      </fieldset>
    `;
    markVisible();

    const answered = answerConflictOfInterestQuestions();

    expect(answered).toBe(0);
    expect((document.getElementById("yes3") as HTMLInputElement).checked).toBe(false);
    expect((document.getElementById("no3") as HTMLInputElement).checked).toBe(false);
  });

  it("does not override a group the user already answered", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Have you ever been employed by Acme Corp?</legend>
        <label for="yes4"><input id="yes4" type="radio" name="acme-employed" /> Yes</label>
        <label for="no4"><input id="no4" type="radio" name="acme-employed" /> No</label>
      </fieldset>
    `;
    markVisible();
    (document.getElementById("yes4") as HTMLInputElement).checked = true;

    const answered = answerConflictOfInterestQuestions();

    expect(answered).toBe(0);
    expect((document.getElementById("yes4") as HTMLInputElement).checked).toBe(true);
  });

  it("skips a matching question when no question text can be found", () => {
    document.body.innerHTML = `
      <div>
        <input id="yes5" type="radio" name="mystery" /> Yes
        <input id="no5" type="radio" name="mystery" /> No
      </div>
    `;
    markVisible();

    const answered = answerConflictOfInterestQuestions();

    expect(answered).toBe(0);
  });
});
