import { describe, expect, it } from "vitest";

import { answerConflictOfInterestQuestions, answerScreeningQuestions } from "./booleanScreeningQuestions";

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

  it("answers 'No' for 'have you previously worked for this organization' phrasing", () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Have you previously worked for this organization? If Yes, please answer the questions below.</legend>
        <label for="yes6"><input id="yes6" type="radio" name="prior-org" /> Yes</label>
        <label for="no6"><input id="no6" type="radio" name="prior-org" /> No</label>
      </fieldset>
    `;
    markVisible();

    const answered = answerConflictOfInterestQuestions();

    expect(answered).toBe(1);
    expect((document.getElementById("no6") as HTMLInputElement).checked).toBe(true);
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

describe("answerScreeningQuestions", () => {
  it("answers standard screening radios with their defaults (Yes for work auth, No for sponsorship)", async () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Are you legally authorized to work in the US for any employer?</legend>
        <label for="auth-y"><input id="auth-y" type="radio" name="auth" /> Yes</label>
        <label for="auth-n"><input id="auth-n" type="radio" name="auth" /> No</label>
      </fieldset>
      <fieldset>
        <legend>Will you need sponsorship in the future to work in the US?</legend>
        <label for="spon-y"><input id="spon-y" type="radio" name="spon" /> Yes</label>
        <label for="spon-n"><input id="spon-n" type="radio" name="spon" /> No</label>
      </fieldset>
      <fieldset>
        <legend>Are you over the age of 18?</legend>
        <label for="age-y"><input id="age-y" type="radio" name="age" /> Yes</label>
        <label for="age-n"><input id="age-n" type="radio" name="age" /> No</label>
      </fieldset>
    `;
    markVisible();

    const answered = await answerScreeningQuestions();

    expect(answered).toBe(3);
    expect((document.getElementById("auth-y") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("spon-n") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("age-y") as HTMLInputElement).checked).toBe(true);
  });

  it("answers 'Have you worked with us before?' as No", async () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>Have you worked with us before?</legend>
        <label for="w-y"><input id="w-y" type="radio" name="worked" /> Yes</label>
        <label for="w-n"><input id="w-n" type="radio" name="worked" /> No</label>
      </fieldset>
    `;
    markVisible();

    await answerScreeningQuestions();

    expect((document.getElementById("w-n") as HTMLInputElement).checked).toBe(true);
  });

  it("leaves an unknown question untouched", async () => {
    document.body.innerHTML = `
      <fieldset>
        <legend>What is your favorite programming language?</legend>
        <label for="u-y"><input id="u-y" type="radio" name="unknown" /> Yes</label>
        <label for="u-n"><input id="u-n" type="radio" name="unknown" /> No</label>
      </fieldset>
    `;
    markVisible();

    const answered = await answerScreeningQuestions();

    expect(answered).toBe(0);
  });
});
