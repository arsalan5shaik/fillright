import { describe, expect, it } from "vitest";

import { fillSkillsQuestion } from "./skillsQuestion";

describe("fillSkillsQuestion", () => {
  it("types and commits each résumé skill as a separate chip via Enter", () => {
    document.body.innerHTML = `<input id="skills" type="text" />`;
    const element = document.getElementById("skills") as HTMLInputElement;
    const committed: string[] = [];

    element.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        committed.push(element.value);
        element.value = ""; // simulates a chip input clearing after commit
      }
    });

    const handled = fillSkillsQuestion({ element, labelText: "Skills" }, ["Python", "AWS", "Kubernetes"], []);

    expect(handled).toBe(true);
    expect(committed).toEqual(["Python", "AWS", "Kubernetes"]);
    expect(element.value).toBe("");
  });

  it("orders résumé skills the JD also asks for first, but never adds a skill the user doesn't have", () => {
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
    fillSkillsQuestion({ element, labelText: "Skills" }, ["Java", "Python", "SQL"], ["Python", "Go"]);

    expect(committed[0]).toBe("Python");
    expect(committed).not.toContain("Go");
    expect(committed).toEqual(expect.arrayContaining(["Java", "SQL"]));
  });

  it("falls back to one comma-separated value when the field isn't a chip input", () => {
    document.body.innerHTML = `<textarea id="skills"></textarea>`;
    const element = document.getElementById("skills") as HTMLTextAreaElement;

    const handled = fillSkillsQuestion({ element, labelText: "Please list your top skills" }, ["Python", "AWS"], []);

    expect(handled).toBe(true);
    expect(element.value).toBe("Python, AWS");
  });

  it("caps at 8 skills", () => {
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
    fillSkillsQuestion({ element, labelText: "Skills" }, many, []);

    expect(committed).toHaveLength(8);
  });

  it("ignores a field that isn't labeled as a skills question", () => {
    document.body.innerHTML = `<input id="other" type="text" />`;
    const element = document.getElementById("other") as HTMLInputElement;

    const handled = fillSkillsQuestion({ element, labelText: "Why do you want this job?" }, ["Python"], []);

    expect(handled).toBe(false);
    expect(element.value).toBe("");
  });

  it("does nothing when the user has no résumé skills", () => {
    document.body.innerHTML = `<input id="skills" type="text" />`;
    const element = document.getElementById("skills") as HTMLInputElement;

    const handled = fillSkillsQuestion({ element, labelText: "Skills" }, [], ["Python"]);

    expect(handled).toBe(false);
    expect(element.value).toBe("");
  });
});
