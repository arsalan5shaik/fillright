import { beforeEach, describe, expect, it } from "vitest";

import { runFillPass, type ValueProvider } from "./fillEngine";

/** Exercises the fill engine against a synthetic Workday-shaped form (real
 * wizard HTML wasn't available to verify against for Milestone 13 - see
 * commit notes) using jsdom, a real independent DOM implementation, not
 * just this codebase's own assumptions about how the DOM behaves. Proves:
 * automation-id and label-based matching both work, already-filled fields
 * are never clobbered, unmatched fields are left alone, confidence marking
 * is correct per match path, and - the one guarantee that matters most -
 * submit/next buttons are never clicked. */
describe("runFillPass", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <label for="fn">First Name</label>
      <input id="fn" data-automation-id="legalName_firstName" />

      <label for="ln">Last Name</label>
      <input id="ln" />

      <input id="email" type="email" aria-label="Email Address" />

      <label for="phone">Phone Number</label>
      <input id="phone" type="tel" />

      <label for="state">State</label>
      <select id="state">
        <option value="">-- select --</option>
        <option value="MO">Missouri</option>
      </select>

      <label for="prefilled">First Name</label>
      <input id="prefilled" value="dont touch me" />

      <label for="unknown">Favorite Color</label>
      <input id="unknown" />

      <button type="submit" id="submit-btn">Submit</button>
      <button type="button" id="next-btn">Next</button>
    `;

    // jsdom doesn't run real layout, so offsetParent (the standard
    // real-browser "is this actually rendered, including via hidden
    // ancestors" check) is always null here - stub it to simulate a
    // visible page, same as any jsdom-based test suite has to for
    // layout-dependent code.
    for (const el of document.querySelectorAll("input, select, textarea, button")) {
      Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
    }
  });

  const testValueProvider: ValueProvider = (concept) => {
    const values: Record<string, string> = {
      first_name: "Jamie",
      last_name: "Rivera",
      email: "jamie@example.invalid",
      phone: "555-1234",
      state: "Missouri",
    };
    const value = values[concept];
    return value ? { value, confidence: "high" } : null;
  };

  it("fills fields matched via data-automation-id with high confidence", () => {
    runFillPass(testValueProvider);
    const fn = document.getElementById("fn") as HTMLInputElement;
    expect(fn.value).toBe("Jamie");
    expect(fn.getAttribute("data-fillright-marked")).toBe("high");
  });

  it("fires a real input event via the native setter (proves the React-safe workaround works)", () => {
    const fn = document.getElementById("fn") as HTMLInputElement;
    let fired = false;
    fn.addEventListener("input", () => {
      fired = true;
    });
    runFillPass(testValueProvider);
    expect(fired).toBe(true);
  });

  it("fills fields matched only via label text, marked as low confidence (fuzzier match path)", () => {
    runFillPass(testValueProvider);
    const ln = document.getElementById("ln") as HTMLInputElement;
    expect(ln.value).toBe("Rivera");
    expect(ln.getAttribute("data-fillright-marked")).toBe("low");
  });

  it("matches via aria-label", () => {
    runFillPass(testValueProvider);
    const email = document.getElementById("email") as HTMLInputElement;
    expect(email.value).toBe("jamie@example.invalid");
  });

  it("fills a native <select> by matching option text", () => {
    runFillPass(testValueProvider);
    const state = document.getElementById("state") as HTMLSelectElement;
    expect(state.value).toBe("MO");
  });

  it("never overwrites a field the user already filled in", () => {
    runFillPass(testValueProvider);
    const prefilled = document.getElementById("prefilled") as HTMLInputElement;
    expect(prefilled.value).toBe("dont touch me");
    expect(prefilled.getAttribute("data-fillright-marked")).toBeNull();
  });

  it("leaves unmatched fields alone and reports them as unmatched", () => {
    const result = runFillPass(testValueProvider);
    const unknown = document.getElementById("unknown") as HTMLInputElement;
    expect(unknown.value).toBe("");
    expect(result.unmatched).toBeGreaterThan(0);
  });

  it("never clicks Submit or Next - the one guarantee that matters most", () => {
    const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
    const nextBtn = document.getElementById("next-btn") as HTMLButtonElement;
    let submitClicks = 0;
    let nextClicks = 0;
    submitBtn.addEventListener("click", () => submitClicks++);
    nextBtn.addEventListener("click", () => nextClicks++);

    runFillPass(testValueProvider);

    expect(submitClicks).toBe(0);
    expect(nextClicks).toBe(0);
  });

  it("reports accurate filled/guessed counts", () => {
    const result = runFillPass(testValueProvider);
    // high-confidence: fn (automation-id match + high value), email (aria-label
    // is treated as a "label" match -> low match confidence in this engine)
    // low-confidence: ln, email, phone, state (all label-text matches)
    expect(result.filled).toBe(1);
    expect(result.guessed).toBe(4);
  });
});
