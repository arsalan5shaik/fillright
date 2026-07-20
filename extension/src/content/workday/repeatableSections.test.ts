import { describe, expect, it } from "vitest";

import { fillEducationSection, fillWorkExperienceSection } from "./repeatableSections";

function markVisible(): void {
  for (const el of document.querySelectorAll("input, textarea")) {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }
}

function panelHtml(index: number, fields: string): string {
  return `
    <div role="group" aria-labelledby="Work-Experience-${index}-panel">
      ${fields}
    </div>
  `;
}

const WORK_EXPERIENCE_FIELDS = `
  <label for="company">Company</label>
  <input id="company" type="text" />
  <label for="title">Job Title</label>
  <input id="title" type="text" />
  <label for="start">Start Date</label>
  <input id="start" type="text" />
  <label for="end">End Date</label>
  <input id="end" type="text" />
  <label for="desc">Role Description</label>
  <textarea id="desc"></textarea>
`;

describe("fillWorkExperienceSection", () => {
  it("reuses an existing default panel for the first entry, then clicks Add Another for the rest", async () => {
    document.body.innerHTML = `
      <div role="group" aria-labelledby="Work-Experience-section">
        <h4 id="Work-Experience-section">Work Experience</h4>
        ${panelHtml(1, WORK_EXPERIENCE_FIELDS.replace(/id="(\w+)"/g, 'id="$1-1"').replace(/for="(\w+)"/g, 'for="$1-1"'))}
        <button data-automation-id="add-button">Add Another</button>
      </div>
    `;
    markVisible();

    const container = document.querySelector('[aria-labelledby="Work-Experience-section"]')!;
    const addButton = container.querySelector<HTMLButtonElement>('[data-automation-id="add-button"]')!;
    addButton.addEventListener("click", () => {
      const panel = document.createElement("div");
      panel.innerHTML = panelHtml(2, WORK_EXPERIENCE_FIELDS.replace(/id="(\w+)"/g, 'id="$1-2"').replace(/for="(\w+)"/g, 'for="$1-2"'));
      addButton.before(panel.firstElementChild!);
      markVisible();
    });

    const entries = [
      {
        company: "Nimbus Systems",
        title: "Backend Engineer",
        start_date: "Feb 2019",
        end_date: "Present",
        location: null,
        bullets: ["Built REST APIs", "Migrated to Kubernetes"],
      },
      {
        company: "Prior Robotics",
        title: "Software Engineer I",
        start_date: "Jul 2016",
        end_date: "Jan 2019",
        location: null,
        bullets: ["Wrote data pipelines"],
      },
    ];

    const filled = await fillWorkExperienceSection(entries);

    expect(filled).toBe(2);
    expect((document.getElementById("company-1") as HTMLInputElement).value).toBe("Nimbus Systems");
    expect((document.getElementById("title-1") as HTMLInputElement).value).toBe("Backend Engineer");
    expect((document.getElementById("desc-1") as HTMLTextAreaElement).value).toBe(
      "Built REST APIs\nMigrated to Kubernetes",
    );
    expect((document.getElementById("company-2") as HTMLInputElement).value).toBe("Prior Robotics");
    expect((document.getElementById("title-2") as HTMLInputElement).value).toBe("Software Engineer I");
  });

  it("does not overwrite a field the user already filled in", async () => {
    document.body.innerHTML = `
      <div role="group" aria-labelledby="Work-Experience-section">
        <h4 id="Work-Experience-section">Work Experience</h4>
        <div role="group" aria-labelledby="Work-Experience-1-panel">
          <label for="company">Company</label>
          <input id="company" type="text" value="Already Typed Inc" />
        </div>
        <button data-automation-id="add-button">Add Another</button>
      </div>
    `;
    markVisible();

    await fillWorkExperienceSection([
      { company: "Nimbus Systems", title: "Engineer", start_date: null, end_date: null, location: null, bullets: [] },
    ]);

    expect((document.getElementById("company") as HTMLInputElement).value).toBe("Already Typed Inc");
  });

  it("returns 0 when the section isn't on the page", async () => {
    document.body.innerHTML = `<div>Nothing here</div>`;
    markVisible();

    const filled = await fillWorkExperienceSection([
      { company: "Nimbus Systems", title: "Engineer", start_date: null, end_date: null, location: null, bullets: [] },
    ]);

    expect(filled).toBe(0);
  });
});

describe("fillEducationSection", () => {
  it("clicks Add for the first entry when the section starts with zero panels", async () => {
    document.body.innerHTML = `
      <div role="group" aria-labelledby="Education-section">
        <h4 id="Education-section">Education</h4>
        <button data-automation-id="add-button">Add</button>
      </div>
    `;
    markVisible();

    const container = document.querySelector('[aria-labelledby="Education-section"]')!;
    const addButton = container.querySelector<HTMLButtonElement>('[data-automation-id="add-button"]')!;
    addButton.addEventListener("click", () => {
      const panel = document.createElement("div");
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-labelledby", "Education-1-panel");
      panel.innerHTML = `
        <label for="school">School</label>
        <input id="school" type="text" />
        <label for="degree">Degree</label>
        <input id="degree" type="text" />
      `;
      addButton.before(panel);
      markVisible();
    });

    const filled = await fillEducationSection([
      { institution: "Riverdale College", degree: "B.S. Computer Science", field_of_study: null, gpa: null, start_date: null, end_date: null },
    ]);

    expect(filled).toBe(1);
    expect((document.getElementById("school") as HTMLInputElement).value).toBe("Riverdale College");
    expect((document.getElementById("degree") as HTMLInputElement).value).toBe("B.S. Computer Science");
  }, 8000);
});
