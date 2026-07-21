import { describe, expect, it } from "vitest";

import { fillSkillsQuestion } from "./skillsQuestion";

// The tests below (except the typeahead one) leave inputs "invisible" in jsdom
// (no offsetParent), so the typeahead multi-select path short-circuits and the
// Enter-chip / comma fallbacks are exercised - matching a plain chip input.

describe("fillSkillsQuestion", () => {
  it("types and commits each résumé skill as a separate chip via Enter", async () => {
    document.body.innerHTML = `<input id="skills" type="text" />`;
    const element = document.getElementById("skills") as HTMLInputElement;
    const committed: string[] = [];

    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        committed.push(element.value);
        element.value = ""; // simulates a chip input clearing after commit
      }
    });

    const handled = await fillSkillsQuestion({ element, labelText: "Skills" }, ["Python", "AWS", "Kubernetes"], []);

    expect(handled).toBe(true);
    expect(committed).toEqual(["Python", "AWS", "Kubernetes"]);
    expect(element.value).toBe("");
  });

  it("orders résumé skills the JD also asks for first, but never adds a skill the user doesn't have", async () => {
    document.body.innerHTML = `<input id="skills" type="text" />`;
    const element = document.getElementById("skills") as HTMLInputElement;
    const committed: string[] = [];
    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        committed.push(element.value);
        element.value = "";
      }
    });

    // Résumé has Java/Python/SQL; JD asks for Python + Go. Python should lead;
    // Go (not on the résumé) must never appear.
    await fillSkillsQuestion({ element, labelText: "Skills" }, ["Java", "Python", "SQL"], ["Python", "Go"]);

    expect(committed[0]).toBe("Python");
    expect(committed).not.toContain("Go");
    expect(committed).toEqual(expect.arrayContaining(["Java", "SQL"]));
  });

  it("falls back to one comma-separated value when the field isn't a chip input", async () => {
    document.body.innerHTML = `<textarea id="skills"></textarea>`;
    const element = document.getElementById("skills") as HTMLTextAreaElement;

    const handled = await fillSkillsQuestion({ element, labelText: "Please list your top skills" }, ["Python", "AWS"], []);

    expect(handled).toBe(true);
    expect(element.value).toBe("Python, AWS");
  });

  it("caps at 8 skills", async () => {
    document.body.innerHTML = `<input id="skills" type="text" />`;
    const element = document.getElementById("skills") as HTMLInputElement;
    const committed: string[] = [];
    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        committed.push(element.value);
        element.value = "";
      }
    });

    const many = Array.from({ length: 12 }, (_, i) => `Skill${i}`);
    await fillSkillsQuestion({ element, labelText: "Skills" }, many, []);

    expect(committed).toHaveLength(8);
  });

  it("ignores a field that isn't labeled as a skills question", async () => {
    document.body.innerHTML = `<input id="other" type="text" />`;
    const element = document.getElementById("other") as HTMLInputElement;

    const handled = await fillSkillsQuestion({ element, labelText: "Why do you want this job?" }, ["Python"], []);

    expect(handled).toBe(false);
    expect(element.value).toBe("");
  });

  it("does nothing when the user has no résumé skills", async () => {
    document.body.innerHTML = `<input id="skills" type="text" />`;
    const element = document.getElementById("skills") as HTMLInputElement;

    const handled = await fillSkillsQuestion({ element, labelText: "Skills" }, [], ["Python"]);

    expect(handled).toBe(false);
    expect(element.value).toBe("");
  });

  it("adds each skill as a chip by picking it from the typeahead dropdown", async () => {
    document.body.innerHTML = `<input id="skills" type="text" /><ul id="opts"></ul>`;
    const element = document.getElementById("skills") as HTMLInputElement;
    const opts = document.getElementById("opts")!;
    // Make the input "visible" so the typeahead path runs.
    Object.defineProperty(element, "offsetParent", { value: document.body, configurable: true });

    const chips: string[] = [];
    // As the user types, render a matching option; clicking it "adds a chip"
    // and clears the input (Workday's multi-select chip behavior).
    element.addEventListener("input", () => {
      const v = element.value.trim();
      opts.innerHTML = v ? `<li role="option">${v}</li>` : "";
      const li = opts.querySelector("li");
      if (li) Object.defineProperty(li, "offsetParent", { value: document.body, configurable: true });
    });
    opts.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      if (t.getAttribute("role") === "option") {
        chips.push(element.value);
        element.value = "";
        opts.innerHTML = "";
      }
    });

    const handled = await fillSkillsQuestion({ element, labelText: "Skills" }, ["Python", "AWS"], []);

    expect(handled).toBe(true);
    expect(chips).toEqual(["Python", "AWS"]);
  });
});
